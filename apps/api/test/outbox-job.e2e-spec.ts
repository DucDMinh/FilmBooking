import type { INestApplication } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AllExceptionsFilter } from "../src/common/errors/all-exceptions.filter";
import { SupabaseService } from "../src/common/supabase/supabase.service";
import { ENV, parseEnv } from "../src/config/env";
import { JobsController, JobsService, MAX_EMAIL_ATTEMPTS } from "../src/modules/jobs/jobs.controller";
import { MAIL_TRANSPORT } from "../src/modules/mail/mail.service";
import { MailModule } from "../src/modules/mail/mail.module";
import {
  DEFAULT_HOTLINE,
  renderAccountLockedAlertEmail,
  renderIdentityChangeEmail,
  renderLatePaymentEmail,
  renderOAuthMissingEmailCollisionEmail,
  renderOAuthMissingEmailVerifyEmail,
  renderPasswordSetEmail,
  renderShowtimeCancelledEmail,
  renderTemplate,
  renderTicketEmail,
} from "../src/modules/mail/templates";

const TEST_JOB_SECRET = "test-job-secret-very-secure-123456789";

const testEnv = parseEnv({
  WEB_ORIGIN: "https://filmbooking.example.com",
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "anon-key-for-test",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-for-test",
  SUPABASE_JWT_SECRET: "jwt-secret-for-test-jwt-secret-1234",
  JOB_SECRET: TEST_JOB_SECRET,
});

interface OutboxRow {
  [key: string]: unknown;
  id: string;
  kind: string;
  to_email: string;
  payload: Record<string, unknown>;
  cinema_id: string | null;
  status: "PENDING" | "SENT" | "FAILED";
  attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
}

interface FakeOrder {
  id: string;
  qr_token: string;
}

interface FakeCinema {
  id: string;
  address: string;
}

interface FakeOrderSeat {
  order_id: string;
  seat_label: string;
}

function createFakeSupabase() {
  const outbox = new Map<string, OutboxRow>();
  const orders = new Map<string, FakeOrder>();
  const cinemas = new Map<string, FakeCinema>();
  const orderSeats = new Map<string, FakeOrderSeat[]>();
  const orderSelects: string[] = [];
  const tablesQueried: string[] = [];

  const reset = (rows: OutboxRow[] = []) => {
    outbox.clear();
    for (const r of rows) {
      outbox.set(r.id, { ...r });
    }
    orders.clear();
    cinemas.clear();
    orderSeats.clear();
    orderSelects.length = 0;
    tablesQueried.length = 0;
  };

  const adminClient = {
    rpc: vi.fn(async (name: string) => {
      // Giả lập chưa có RPC claim_email_outbox_batch trong DB -> fallback sang query/update
      if (name === "claim_email_outbox_batch") {
        return { data: null, error: { message: "function not found", code: "PGRST202" } };
      }
      return { data: null, error: null };
    }),
    from: (table: string) => {
      tablesQueried.push(table);

      if (table === "orders") {
        return {
          // Chỉ hỗ trợ đúng truy vấn mong muốn: orders.select("qr_token").eq("id", ...).maybeSingle().
          select: (columns: string) => {
            orderSelects.push(columns);
            return {
              eq: (_col: string, val: unknown) => ({
                maybeSingle: async () => {
                  const order = orders.get(String(val));
                  return { data: order ? { qr_token: order.qr_token } : null, error: null };
                },
              }),
            };
          },
        };
      }

      if (table === "cinemas") {
        return {
          select: () => ({
            eq: (_col: string, val: unknown) => {
              const cinema = cinemas.get(String(val));
              return {
                maybeSingle: async () => ({
                  data: cinema ? { address: cinema.address } : null,
                  error: null,
                }),
                then: (resolve: (val: { data: unknown; error: null }) => void) => {
                  resolve({
                    data: cinema ? [{ address: cinema.address }] : [],
                    error: null,
                  });
                },
              };
            },
          }),
        };
      }

      if (table === "order_seats") {
        return {
          select: () => ({
            eq: (_col: string, val: unknown) => {
              const list = orderSeats.get(String(val)) ?? [];
              const data = list.map((s) => ({ seat_label: s.seat_label }));
              return {
                then: (resolve: (val: { data: unknown; error: null }) => void) => {
                  resolve({ data, error: null });
                },
              };
            },
          }),
        };
      }

      if (table !== "email_outbox") {
        return {
          select: () => ({ eq: () => ({ data: [], error: null }) }),
        };
      }

      return {
        select: () => {
          let filtered = [...outbox.values()];

          const builder = {
            eq: (col: string, val: unknown) => {
              filtered = filtered.filter((row) => (row as Record<string, unknown>)[col] === val);
              return builder;
            },
            lte: (col: string, val: string) => {
              filtered = filtered.filter((row) => {
                const cell = (row as Record<string, unknown>)[col] as string;
                return new Date(cell).getTime() <= new Date(val).getTime();
              });
              return builder;
            },
            order: () => {
              filtered.sort((a, b) => new Date(a.next_attempt_at).getTime() - new Date(b.next_attempt_at).getTime());
              return builder;
            },
            limit: (n: number) => {
              filtered = filtered.slice(0, n);
              return Promise.resolve({ data: filtered.map((r) => ({ ...r })), error: null });
            },
            then: (resolve: (val: { data: OutboxRow[]; error: null }) => void) => {
              resolve({ data: filtered.map((r) => ({ ...r })), error: null });
            },
          };
          return builder;
        },

        update: (patch: Partial<OutboxRow>) => {
          let targets = [...outbox.values()];

          const updateBuilder = {
            eq: (col: string, val: unknown) => {
              targets = targets.filter((row) => (row as Record<string, unknown>)[col] === val);
              return updateBuilder;
            },
            lte: (col: string, val: string) => {
              targets = targets.filter((row) => {
                const cell = (row as Record<string, unknown>)[col] as string;
                return new Date(cell).getTime() <= new Date(val).getTime();
              });
              return updateBuilder;
            },
            select: () => {
              const updatedRows: OutboxRow[] = [];
              for (const target of targets) {
                const existing = outbox.get(target.id);
                if (existing) {
                  const updated = { ...existing, ...patch };
                  outbox.set(target.id, updated);
                  updatedRows.push(updated);
                }
              }
              return Promise.resolve({ data: updatedRows, error: null });
            },
            then: (resolve: (val: { data: OutboxRow[]; error: null }) => void) => {
              const updatedRows: OutboxRow[] = [];
              for (const target of targets) {
                const existing = outbox.get(target.id);
                if (existing) {
                  const updated = { ...existing, ...patch };
                  outbox.set(target.id, updated);
                  updatedRows.push(updated);
                }
              }
              resolve({ data: updatedRows, error: null });
            },
          };
          return updateBuilder;
        },
      };
    },
  };

  return {
    admin: () => adminClient,
    getRows: () => [...outbox.values()],
    orderSelects,
    tablesQueried,
    reset,
    setOrders: (items: FakeOrder[]) => {
      for (const o of items) orders.set(o.id, o);
    },
    setCinemas: (items: FakeCinema[]) => {
      for (const c of items) cinemas.set(c.id, c);
    },
    setOrderSeats: (items: FakeOrderSeat[]) => {
      for (const s of items) {
        const list = orderSeats.get(s.order_id) ?? [];
        list.push(s);
        orderSeats.set(s.order_id, list);
      }
    },
  };
}

describe("Outbox Job & Email Worker", () => {
  let app: INestApplication;
  const fakeDb = createFakeSupabase();
  const sendMailMock = vi.fn();

  beforeAll(async () => {
    const fakeTransport = { sendMail: sendMailMock };

    const moduleRef = await Test.createTestingModule({
      imports: [MailModule],
      controllers: [JobsController],
      providers: [
        JobsService,
        { provide: SupabaseService, useValue: { admin: fakeDb.admin } },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    })
      .overrideProvider(ENV)
      .useValue(testEnv)
      .overrideProvider(MAIL_TRANSPORT)
      .useValue(fakeTransport)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    fakeDb.reset();
    sendMailMock.mockReset();
    sendMailMock.mockResolvedValue({ messageId: "mock-smtp-id-123" });
  });

  describe("AC-23 & Bảo mật: JobSecretGuard", () => {
    it("Trả về 401 khi không truyền header x-job-secret", async () => {
      const res = await request(app.getHttpServer()).post("/jobs/send-emails");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    });

    it("Trả về 401 khi truyền sai x-job-secret", async () => {
      const res = await request(app.getHttpServer())
        .post("/jobs/send-emails")
        .set("x-job-secret", "wrong-secret-value");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    });

    it("Trả về 200 khi header x-job-secret chính xác", async () => {
      const res = await request(app.getHttpServer())
        .post("/jobs/send-emails")
        .set("x-job-secret", TEST_JOB_SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        processed: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
      });
    });
  });

  describe("Xử lý batch email PENDING -> SENT (SMTP mock)", () => {
    it("Outbox 3 email PENDING -> gọi job -> 3 SENT qua SMTP", async () => {
      const pastTime = new Date(Date.now() - 60000).toISOString();
      const mockRows: OutboxRow[] = [
        {
          id: "email-1",
          kind: "TICKET_ISSUED",
          to_email: "khach1@example.com",
          payload: {
            booking_code: "HN01-TICKET1",
            qr_token: "qr-token-abc-123",
            cinema_name: "FilmBooking Cinema Hà Nội",
            movie_title: "Dune 2",
            showtime_starts_at: "2026-11-20T19:30:00Z",
            room_name: "Phòng 1",
            seats: ["A1", "A2"],
            total_amount: 180000,
          },
          cinema_id: "hn01-uuid",
          status: "PENDING",
          attempts: 0,
          next_attempt_at: pastTime,
          last_error: null,
          created_at: pastTime,
          sent_at: null,
        },
        {
          id: "email-2",
          kind: "ACCOUNT_LOCKED_ALERT",
          to_email: "khach2@example.com",
          payload: {
            lockMinutes: 15,
            lockedUntil: "2026-11-13T12:00:00Z",
          },
          cinema_id: null,
          status: "PENDING",
          attempts: 0,
          next_attempt_at: pastTime,
          last_error: null,
          created_at: pastTime,
          sent_at: null,
        },
        {
          id: "email-3",
          kind: "showtime_cancelled",
          to_email: "khach3@example.com",
          payload: {
            booking_code: "HN01-CANCEL3",
            cinema_name: "FilmBooking Hà Nội",
            movie_title: "Avatar 3",
            room_name: "Phòng 2",
            showtime_starts_at: "2026-11-21T18:00:00Z",
            reason: "Sự cố máy chiếu",
          },
          cinema_id: "hn01-uuid",
          status: "PENDING",
          attempts: 0,
          next_attempt_at: pastTime,
          last_error: null,
          created_at: pastTime,
          sent_at: null,
        },
      ];

      fakeDb.reset(mockRows);

      const res = await request(app.getHttpServer())
        .post("/jobs/send-emails")
        .set("x-job-secret", TEST_JOB_SECRET);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        processed: 3,
        sent: 3,
        failed: 0,
        skipped: 0,
      });

      expect(sendMailMock).toHaveBeenCalledTimes(3);

      const rows = fakeDb.getRows();
      expect(rows.every((r) => r.status === "SENT")).toBe(true);
      expect(rows.every((r) => r.attempts === 1)).toBe(true);
      expect(rows.every((r) => r.sent_at !== null)).toBe(true);
      expect(rows.every((r) => r.last_error === null)).toBe(true);
    });

    function ticketIssuedRow(id: string, orderId: string, cinemaId: string, extraPayload: Record<string, unknown> = {}): OutboxRow {
      const pastTime = new Date(Date.now() - 60000).toISOString();
      return {
        id,
        kind: "TICKET_ISSUED",
        to_email: "khach-enrich@example.com",
        payload: {
          order_id: orderId,
          booking_code: "HN01-ENRICH",
          cinema_id: cinemaId,
          cinema_name: "FilmBooking Vincom Hà Nội",
          movie_title: "Interstellar",
          room_name: "Phòng IMAX",
          showtime_starts_at: "2026-11-25T20:00:00Z",
          total_amount: 300000,
          // KHÔNG truyền qr_token, cinema_address, seats (đúng payload do DB enqueue)
          ...extraPayload,
        },
        cinema_id: cinemaId,
        status: "PENDING",
        attempts: 0,
        next_attempt_at: pastTime,
        last_error: null,
        created_at: pastTime,
        sent_at: null,
      };
    }

    async function runSendEmails() {
      const res = await request(app.getHttpServer()).post("/jobs/send-emails").set("x-job-secret", TEST_JOB_SECRET);
      expect(res.status).toBe(200);
      return res;
    }

    it("B/M5: đơn nhiều ghế -> enrich lấy qr_token của ĐƠN (orders), 1 ảnh QR duy nhất, đủ ghế, không truy vấn tickets", async () => {
      const orderId = "order-uuid-enrich-01";
      const cinemaId = "cinema-uuid-enrich-01";
      fakeDb.reset([ticketIssuedRow("email-ticket-enrich", orderId, cinemaId)]);
      fakeDb.setOrders([{ id: orderId, qr_token: "qr-token-order-level-01" }]);
      fakeDb.setCinemas([{ id: cinemaId, address: "Tầng 5, TTTM Vincom, 54A Nguyễn Chí Thanh, Hà Nội" }]);
      fakeDb.setOrderSeats([
        { order_id: orderId, seat_label: "A10" },
        { order_id: orderId, seat_label: "A2" },
        { order_id: orderId, seat_label: "B1" },
      ]);

      const res = await runSendEmails();

      expect(res.body.sent).toBe(1);
      expect(fakeDb.orderSelects).toEqual(["qr_token"]);
      expect(fakeDb.tablesQueried).not.toContain("tickets");
      expect(sendMailMock).toHaveBeenCalledTimes(1);
      const callArgs = sendMailMock.mock.calls[0]![0];
      expect(callArgs.to).toBe("khach-enrich@example.com");
      expect(callArgs.html).toContain("54A Nguyễn Chí Thanh");
      expect(callArgs.text).toContain("54A Nguyễn Chí Thanh");

      expect((callArgs.attachments as { cid: string }[]).map((att) => att.cid)).toEqual(["ticket-qr"]);
      expect((callArgs.html as string).match(/<img src="cid:/g)).toHaveLength(1);
      expect(callArgs.html).toContain("qr-token-order-level-01");
      // Thứ tự tự nhiên (A2 trước A10), khớp RPC soát vé và trang vé web.
      expect(callArgs.html).toContain("A2, A10, B1");
      expect(callArgs.text).toContain("A2, A10, B1");
      expect(callArgs.html).toContain("Một mã QR cho cả đơn");
      expect(callArgs.html).not.toContain("Mỗi ghế có một mã QR riêng");
      expect(callArgs.text).toContain("QR Token: qr-token-order-level-01");

      const row = fakeDb.getRows().find((r) => r.id === "email-ticket-enrich")!;
      expect(row.status).toBe("SENT");
    });

    it("B/M5: ghế lộn xộn từ DB -> email xếp tự nhiên theo hàng rồi số (A2 < A10 < B1 < B3 < C12)", async () => {
      const orderId = "order-uuid-enrich-seat-order";
      const cinemaId = "cinema-uuid-enrich-seat-order";
      fakeDb.reset([ticketIssuedRow("email-ticket-seat-order", orderId, cinemaId)]);
      fakeDb.setOrders([{ id: orderId, qr_token: "qr-token-order-seat-order" }]);
      fakeDb.setCinemas([{ id: cinemaId, address: "Hà Nội" }]);
      fakeDb.setOrderSeats(
        ["C12", "A10", "B3", "A2", "C2", "B1"].map((seat_label) => ({ order_id: orderId, seat_label })),
      );

      await runSendEmails();

      const callArgs = sendMailMock.mock.calls[0]![0];
      expect(callArgs.html).toContain("A2, A10, B1, B3, C2, C12");
      expect(callArgs.text).toContain("A2, A10, B1, B3, C2, C12");
    });

    it("B/M5: payload đã có sẵn qr_token (outbox cũ) -> không truy vấn orders, giữ nguyên token", async () => {
      const orderId = "order-uuid-enrich-legacy";
      const cinemaId = "cinema-uuid-enrich-legacy";
      fakeDb.reset([ticketIssuedRow("email-ticket-legacy", orderId, cinemaId, { qr_token: "qr-token-from-payload" })]);
      fakeDb.setOrders([{ id: orderId, qr_token: "qr-token-from-db" }]);
      fakeDb.setCinemas([{ id: cinemaId, address: "Hà Nội" }]);

      await runSendEmails();

      expect(fakeDb.orderSelects).toEqual([]);
      const callArgs = sendMailMock.mock.calls[0]![0];
      expect(callArgs.html).toContain("qr-token-from-payload");
      expect(callArgs.html).not.toContain("qr-token-from-db");
      expect(callArgs.attachments).toHaveLength(1);
    });

    it("B/M5: payload cũ per-ticket (có tickets[] nhưng không qr_token) -> vẫn lấy token của đơn, bỏ tickets[]", async () => {
      const orderId = "order-uuid-enrich-oldlist";
      const cinemaId = "cinema-uuid-enrich-oldlist";
      fakeDb.reset([
        ticketIssuedRow("email-ticket-oldlist", orderId, cinemaId, {
          tickets: [{ seat_label: "A1", qr_token: "qr-token-per-ticket-cu" }],
        }),
      ]);
      fakeDb.setOrders([{ id: orderId, qr_token: "qr-token-order-level-02" }]);
      fakeDb.setCinemas([{ id: cinemaId, address: "Hà Nội" }]);

      await runSendEmails();

      const callArgs = sendMailMock.mock.calls[0]![0];
      expect(callArgs.attachments).toHaveLength(1);
      expect(callArgs.html).toContain("qr-token-order-level-02");
      expect(callArgs.html).not.toContain("qr-token-per-ticket-cu");
    });

    it("B/M5: không đọc được orders.qr_token (đơn không tồn tại) -> vẫn gửi mail không có QR", async () => {
      const orderId = "order-uuid-enrich-missing";
      const cinemaId = "cinema-uuid-enrich-missing";
      fakeDb.reset([ticketIssuedRow("email-ticket-missing", orderId, cinemaId)]);
      fakeDb.setCinemas([{ id: cinemaId, address: "Hà Nội" }]);

      const res = await runSendEmails();

      expect(res.body.sent).toBe(1);
      const callArgs = sendMailMock.mock.calls[0]![0];
      expect(callArgs.attachments).toBeUndefined();
      expect(callArgs.html).not.toContain('<img src="cid:');
    });
  });

  describe("Xử lý lỗi gửi, retry backoff và max attempts -> FAILED", () => {
    it("Gặp lỗi SMTP -> cập nhật attempts, last_error và chuyển FAILED sau max attempts", async () => {
      const pastTime = new Date(Date.now() - 60000).toISOString();
      const mockRow: OutboxRow = {
        id: "email-fail",
        kind: "TICKET_ISSUED",
        to_email: "fail@example.com",
        payload: { booking_code: "FAIL-01", qr_token: "token-fail" },
        cinema_id: null,
        status: "PENDING",
        attempts: 0,
        next_attempt_at: pastTime,
        last_error: null,
        created_at: pastTime,
        sent_at: null,
      };

      fakeDb.reset([mockRow]);

      // Giả lập SMTP trả lỗi
      sendMailMock.mockRejectedValue(new Error("SMTP connection timeout"));

      // Lần 1: attempts lên 1, status vẫn PENDING
      const res1 = await request(app.getHttpServer())
        .post("/jobs/send-emails")
        .set("x-job-secret", TEST_JOB_SECRET);
      expect(res1.status).toBe(200);
      expect(res1.body.sent).toBe(0);

      let row = fakeDb.getRows().find((r) => r.id === "email-fail")!;
      expect(row.attempts).toBe(1);
      expect(row.status).toBe("PENDING");
      expect(row.last_error).toContain("SMTP connection timeout");

      // Cập nhật next_attempt_at về quá khứ để chạy lần 2
      row.next_attempt_at = new Date(Date.now() - 60000).toISOString();

      // Lần 2: attempts lên 2, status vẫn PENDING
      await request(app.getHttpServer())
        .post("/jobs/send-emails")
        .set("x-job-secret", TEST_JOB_SECRET);

      row = fakeDb.getRows().find((r) => r.id === "email-fail")!;
      expect(row.attempts).toBe(2);
      expect(row.status).toBe("PENDING");

      // Cập nhật next_attempt_at về quá khứ để chạy lần 3 (chạm MAX_EMAIL_ATTEMPTS = 3)
      row.next_attempt_at = new Date(Date.now() - 60000).toISOString();

      // Lần 3: attempts lên 3 -> chuyển thành FAILED
      const res3 = await request(app.getHttpServer())
        .post("/jobs/send-emails")
        .set("x-job-secret", TEST_JOB_SECRET);

      expect(res3.body.failed).toBe(1);

      row = fakeDb.getRows().find((r) => r.id === "email-fail")!;
      expect(row.attempts).toBe(MAX_EMAIL_ATTEMPTS);
      expect(row.status).toBe("FAILED");
      expect(row.last_error).toContain("SMTP connection timeout");
    });
  });

  describe("AC: Concurrency - 2 job gọi song song không gửi trùng (SKIP LOCKED)", () => {
    it("Gọi job 2 lần đồng thời không gửi trùng bất kỳ email nào", async () => {
      const pastTime = new Date(Date.now() - 60000).toISOString();
      const mockRows: OutboxRow[] = [
        {
          id: "concur-1",
          kind: "TICKET_ISSUED",
          to_email: "user1@test.com",
          payload: { booking_code: "C1" },
          cinema_id: null,
          status: "PENDING",
          attempts: 0,
          next_attempt_at: pastTime,
          last_error: null,
          created_at: pastTime,
          sent_at: null,
        },
        {
          id: "concur-2",
          kind: "TICKET_ISSUED",
          to_email: "user2@test.com",
          payload: { booking_code: "C2" },
          cinema_id: null,
          status: "PENDING",
          attempts: 0,
          next_attempt_at: pastTime,
          last_error: null,
          created_at: pastTime,
          sent_at: null,
        },
        {
          id: "concur-3",
          kind: "TICKET_ISSUED",
          to_email: "user3@test.com",
          payload: { booking_code: "C3" },
          cinema_id: null,
          status: "PENDING",
          attempts: 0,
          next_attempt_at: pastTime,
          last_error: null,
          created_at: pastTime,
          sent_at: null,
        },
      ];

      fakeDb.reset(mockRows);

      // Thêm một độ trễ nhỏ giả lập thời gian gửi qua network để 2 request trùng thời điểm xử lý
      sendMailMock.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { messageId: "smtp-mock-id" };
      });

      const callJob = () =>
        request(app.getHttpServer())
          .post("/jobs/send-emails")
          .set("x-job-secret", TEST_JOB_SECRET);

      const [resA, resB] = await Promise.all([callJob(), callJob()]);

      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);

      // Tổng số email gửi đi của cả 2 job chính xác là 3
      const totalSent = resA.body.sent + resB.body.sent;
      expect(totalSent).toBe(3);

      // SMTP chỉ được gọi đúng 3 lần (không trùng email nào)
      expect(sendMailMock).toHaveBeenCalledTimes(3);

      const rows = fakeDb.getRows();
      expect(rows.filter((r) => r.status === "SENT").length).toBe(3);
    });
  });

  describe("AC-26 & Requirements: Template kiểm tra nội dung & bảo mật", () => {
    it("Template vé: chứa booking_code, qr_token, cinema_name, lưu ý R-133, không chứa dữ liệu nhạy cảm", () => {
      const rendered = renderTicketEmail({
        booking_code: "HN01-ABCDEF",
        qr_token: "secret-random-qr-token-xyz",
        cinema_name: "FilmBooking CGV Hà Nội",
        cinema_address: "54 Liễu Giai, Ba Đình, Hà Nội",
        movie_title: "Thám Tử Lừng Danh Conan",
        age_rating: "T13",
        room_name: "Cinema 3",
        showtime_starts_at: "2026-11-20T19:00:00Z",
        seats: ["F8", "F9"],
        total_amount: 220000,
      });

      expect(rendered.subject).toContain("HN01-ABCDEF");
      expect(rendered.html).toContain("HN01-ABCDEF");
      expect(rendered.html).toContain("secret-random-qr-token-xyz");
      expect(rendered.html).toContain("FilmBooking CGV Hà Nội");
      expect(rendered.html).toContain("54 Liễu Giai");
      expect(rendered.html).toContain("Thám Tử Lừng Danh Conan");
      expect(rendered.html).toContain("220.000 đ");

      // R-133 & R-86: các lưu ý bắt buộc
      expect(rendered.html).toContain("15 phút");
      expect(rendered.html).toContain("Vé chỉ dùng tại rạp ghi trên vé");
      expect(rendered.html).toContain("Vé không huỷ / không hoàn tiền");
      expect(rendered.html).toContain("giấy tờ tuỳ thân");

      // AC-26: Không chứa password, token bí mật hay dữ liệu riêng tư nhạy cảm
      expect(rendered.html).not.toContain("password");
      expect(rendered.html).not.toContain("access_token");
      expect(rendered.html).not.toContain("refresh_token");
    });

    it("Template huỷ suất: chỉ hướng dẫn liên hệ CSKH để hoàn tiền thủ công (R-109, bỏ đổi suất)", () => {
      const rendered = renderShowtimeCancelledEmail({
        booking_code: "HN01-CANCEL-1",
        cinema_name: "FilmBooking Cinema Hải Phòng",
        movie_title: "Dune",
        room_name: "Phòng VIP",
        showtime_starts_at: "2026-11-22T20:00:00Z",
        reason: "Bảo trì rạp",
        hotline: "1900 1234",
      });

      expect(rendered.subject).toContain("HN01-CANCEL-1");
      expect(rendered.html).toContain("1900 1234");
      expect(rendered.html).toContain("hoàn tiền");
      expect(rendered.html).toContain("thủ công");

      // Phạm vi thay đổi (Scope change spec 3.0.0): Không có đổi suất
      expect(rendered.html).toContain("không hỗ trợ đổi sang suất chiếu khác");
      expect(rendered.text).toContain("không hỗ trợ đổi sang suất chiếu khác");
    });

    it("Template cảnh báo khoá đăng nhập (R-11)", () => {
      const rendered = renderAccountLockedAlertEmail({
        lockMinutes: 15,
        lockedUntil: "2026-11-13T12:00:00Z",
      });

      expect(rendered.subject).toContain("tạm khoá đăng nhập");
      expect(rendered.html).toContain("15 phút");
      expect(rendered.html).toContain("5 lần liên tiếp");
      expect(rendered.text).toContain("5 lần liên tiếp");
    });

    it("Template liên kết MXH (R-24)", () => {
      const linked = renderIdentityChangeEmail({ provider: "google" }, false);
      expect(linked.subject).toContain("liên kết");
      expect(linked.html).toContain("GOOGLE");

      const unlinked = renderIdentityChangeEmail({ provider: "facebook" }, true);
      expect(unlinked.subject).toContain("huỷ liên kết");
      expect(unlinked.html).toContain("FACEBOOK");
    });

    it("Template tiền về muộn (R-78)", () => {
      const rendered = renderLatePaymentEmail({
        booking_code: "HN01-LATE",
        cinema_name: "FilmBooking Cinema Đà Nẵng",
        movie_title: "Kungfu Panda",
        amount: 100000,
        transaction_ref: "PAYOS-9999",
        reason: "LATE_PAYMENT",
      });

      expect(rendered.subject).toContain("HN01-LATE");
      expect(rendered.html).toContain("PAYOS-9999");
      expect(rendered.html).toContain("100.000 đ");
      expect(rendered.html).toContain(DEFAULT_HOTLINE);
      expect(rendered.html).toContain("liên hệ");
    });
  });

  describe("B/M6: Template và Worker xử lý các email của IdentityModule", () => {
    it("renderPasswordSetEmail: tiêu đề chuẩn, nút đặt mật khẩu kèm token, không lộ JSON thô hoặc user_id", () => {
      const rendered = renderPasswordSetEmail({
        user_id: "secret-user-id-001",
        token: "pwd-token-abc-999",
        web_origin: "https://filmbooking.example.com",
      });

      expect(rendered.subject).toBe("[CINEMO] Thiết lập mật khẩu tài khoản");
      expect(rendered.html).toContain("Thiết lập mật khẩu");
      expect(rendered.html).toContain("https://filmbooking.example.com/auth/set-password?token=pwd-token-abc-999");
      expect(rendered.html).not.toContain("secret-user-id-001");
      expect(rendered.html).not.toContain('{"');
      expect(rendered.text).toContain("https://filmbooking.example.com/auth/set-password?token=pwd-token-abc-999");
      expect(rendered.text).not.toContain("secret-user-id-001");
    });

    it("renderOAuthMissingEmailCollisionEmail: tiêu đề chuẩn, hướng dẫn đăng nhập cũ và link hồ sơ liên kết", () => {
      const rendered = renderOAuthMissingEmailCollisionEmail({
        provider: "facebook",
        user_id: "secret-collision-user-002",
        web_origin: "https://filmbooking.example.com",
      });

      expect(rendered.subject).toBe("[CINEMO] Phát hiện liên kết tài khoản trùng email");
      expect(rendered.html).toContain("FACEBOOK");
      expect(rendered.html).toContain("https://filmbooking.example.com/auth/login?redirect=/me/profile");
      expect(rendered.html).toContain("https://filmbooking.example.com/me/profile");
      expect(rendered.html).not.toContain("secret-collision-user-002");
      expect(rendered.html).not.toContain('{"');
      expect(rendered.text).toContain("FACEBOOK");
      expect(rendered.text).not.toContain("secret-collision-user-002");
    });

    it("renderOAuthMissingEmailVerifyEmail: tiêu đề chuẩn, nút xác thực email kèm token, không lộ JSON thô", () => {
      const rendered = renderOAuthMissingEmailVerifyEmail({
        provider: "facebook",
        token: "verify-token-xyz-888",
        web_origin: "https://filmbooking.example.com",
      });

      expect(rendered.subject).toBe("[CINEMO] Xác thực email bổ sung");
      expect(rendered.html).toContain("Xác thực email");
      expect(rendered.html).toContain("https://filmbooking.example.com/auth/oauth/verify-email?token=verify-token-xyz-888");
      expect(rendered.html).toContain("FACEBOOK");
      expect(rendered.html).not.toContain('{"');
      expect(rendered.text).toContain("https://filmbooking.example.com/auth/oauth/verify-email?token=verify-token-xyz-888");
    });

    it("renderTemplate ném lỗi UNKNOWN_KIND đối với kind không hợp lệ, không fallback JSON dump", () => {
      expect(() => {
        renderTemplate("invalid_unknown_kind", { some: "secret-data" });
      }).toThrow(/UNKNOWN_KIND/);
    });

    it("Worker gửi thành công cả 3 loại email của IdentityModule không chứa JSON thô", async () => {
      const pastTime = new Date(Date.now() - 60000).toISOString();
      const mockRows: OutboxRow[] = [
        {
          id: "id-email-1",
          kind: "password_set",
          to_email: "pwd@example.com",
          payload: {
            user_id: "user-pwd-123",
            token: "tok-pwd-123",
          },
          cinema_id: null,
          status: "PENDING",
          attempts: 0,
          next_attempt_at: pastTime,
          last_error: null,
          created_at: pastTime,
          sent_at: null,
        },
        {
          id: "id-email-2",
          kind: "oauth_missing_email_collision",
          to_email: "collision@example.com",
          payload: {
            user_id: "user-col-456",
            provider: "facebook",
          },
          cinema_id: null,
          status: "PENDING",
          attempts: 0,
          next_attempt_at: pastTime,
          last_error: null,
          created_at: pastTime,
          sent_at: null,
        },
        {
          id: "id-email-3",
          kind: "oauth_missing_email_verify",
          to_email: "verify@example.com",
          payload: {
            provider: "facebook",
            token: "tok-ver-789",
          },
          cinema_id: null,
          status: "PENDING",
          attempts: 0,
          next_attempt_at: pastTime,
          last_error: null,
          created_at: pastTime,
          sent_at: null,
        },
      ];

      fakeDb.reset(mockRows);

      const res = await request(app.getHttpServer())
        .post("/jobs/send-emails")
        .set("x-job-secret", TEST_JOB_SECRET);

      expect(res.status).toBe(200);
      expect(res.body.sent).toBe(3);

      expect(sendMailMock).toHaveBeenCalledTimes(3);

      // Đảm bảo không cuộc gọi nào gửi JSON thô
      for (const call of sendMailMock.mock.calls) {
        const { html, text } = call[0]!;
        expect(html).not.toContain("<pre>");
        expect(html).not.toContain('{"');
        expect(text).not.toContain('{"');
      }

      const rows = fakeDb.getRows();
      expect(rows.every((r) => r.status === "SENT")).toBe(true);
    });

    it("Worker đánh FAILED ngay với last_error=UNKNOWN_KIND khi gặp kind không hỗ trợ", async () => {
      const pastTime = new Date(Date.now() - 60000).toISOString();
      const mockRow: OutboxRow = {
        id: "id-unknown-kind",
        kind: "totally_unknown_kind",
        to_email: "unknown@example.com",
        payload: { secret: "do-not-dump" },
        cinema_id: null,
        status: "PENDING",
        attempts: 0,
        next_attempt_at: pastTime,
        last_error: null,
        created_at: pastTime,
        sent_at: null,
      };

      fakeDb.reset([mockRow]);

      const res = await request(app.getHttpServer())
        .post("/jobs/send-emails")
        .set("x-job-secret", TEST_JOB_SECRET);

      expect(res.status).toBe(200);
      expect(res.body.failed).toBe(1);
      expect(sendMailMock).not.toHaveBeenCalled();

      const row = fakeDb.getRows().find((r) => r.id === "id-unknown-kind")!;
      expect(row.status).toBe("FAILED");
      expect(row.last_error).toContain("UNKNOWN_KIND");
    });
  });
});
