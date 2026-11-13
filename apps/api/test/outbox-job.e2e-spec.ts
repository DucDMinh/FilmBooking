import type { INestApplication } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AllExceptionsFilter } from "../src/common/errors/all-exceptions.filter";
import { SupabaseService } from "../src/common/supabase/supabase.service";
import { ENV, parseEnv } from "../src/config/env";
import { JobsController, JobsService, MAX_EMAIL_ATTEMPTS } from "../src/modules/jobs/jobs.controller";
import { RESEND_CLIENT } from "../src/modules/mail/mail.service";
import { MailModule } from "../src/modules/mail/mail.module";
import {
  DEFAULT_HOTLINE,
  renderAccountLockedAlertEmail,
  renderIdentityChangeEmail,
  renderLatePaymentEmail,
  renderShowtimeCancelledEmail,
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

function createFakeSupabase() {
  const outbox = new Map<string, OutboxRow>();

  const reset = (rows: OutboxRow[] = []) => {
    outbox.clear();
    for (const r of rows) {
      outbox.set(r.id, { ...r });
    }
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
    reset,
  };
}

describe("Outbox Job & Email Worker", () => {
  let app: INestApplication;
  const fakeDb = createFakeSupabase();
  const resendSendMock = vi.fn();

  beforeAll(async () => {
    const fakeResend = {
      emails: {
        send: resendSendMock,
      },
    };

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
      .overrideProvider(RESEND_CLIENT)
      .useValue(fakeResend)
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
    resendSendMock.mockReset();
    resendSendMock.mockResolvedValue({ data: { id: "mock-resend-id-123" }, error: null });
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

  describe("Xử lý batch email PENDING -> SENT (Resend mock)", () => {
    it("Outbox 3 email PENDING -> gọi job -> 3 SENT qua Resend", async () => {
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

      expect(resendSendMock).toHaveBeenCalledTimes(3);

      const rows = fakeDb.getRows();
      expect(rows.every((r) => r.status === "SENT")).toBe(true);
      expect(rows.every((r) => r.attempts === 1)).toBe(true);
      expect(rows.every((r) => r.sent_at !== null)).toBe(true);
      expect(rows.every((r) => r.last_error === null)).toBe(true);
    });
  });

  describe("Xử lý lỗi gửi, retry backoff và max attempts -> FAILED", () => {
    it("Gặp lỗi Resend -> cập nhật attempts, last_error và chuyển FAILED sau max attempts", async () => {
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

      // Giả lập Resend trả lỗi
      resendSendMock.mockRejectedValue(new Error("SMTP connection timeout"));

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
      resendSendMock.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { data: { id: "resend-mock-id" }, error: null };
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

      // Resend chỉ được gọi đúng 3 lần (không trùng email nào)
      expect(resendSendMock).toHaveBeenCalledTimes(3);

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
});
