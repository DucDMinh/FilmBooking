import type { INestApplication } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { SignJWT } from "jose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AccessService } from "../src/common/auth/access.service";
import { AuthGuard } from "../src/common/auth/auth.guard";
import { CinemaScopeGuard } from "../src/common/auth/cinema-scope.guard";
import { RolesGuard } from "../src/common/auth/roles.guard";
import { AllExceptionsFilter } from "../src/common/errors/all-exceptions.filter";
import { SupabaseService } from "../src/common/supabase/supabase.service";
import { ENV, type Env } from "../src/config/env";
import { RoomsController } from "../src/modules/cinema-ops/rooms.controller";
import { SeatLayoutService, throwDbError } from "../src/modules/cinema-ops/seat-layout.service";
import { ShowtimesController } from "../src/modules/cinema-ops/showtimes.controller";
import { ShowtimesService } from "../src/modules/cinema-ops/showtimes.service";

// ── Dữ liệu cố định ─────────────────────────────────────────────────────────
const JWT_SECRET = "test-jwt-secret-test-jwt-secret-1234";
const SUPABASE_URL = "https://abc.supabase.co";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const HN01 = uuid(1);
const HN02 = uuid(2);
const ROOM_HN01 = uuid(11);
const ROOM_HN02 = uuid(12);
const ROOM_HN01_B = uuid(13);
const MOVIE = uuid(21);
const ADMIN = uuid(31);
const MANAGER_HN01 = uuid(32);
const STAFF_HN01 = uuid(33);
const SHOWTIME_1900 = uuid(41);
const SEAT_A1 = uuid(51);
const SEAT_AISLE = uuid(52);

// Phim 120 phút + dọn phòng mặc định 15 phút = 135 phút (19:00–21:15 như AC-14).
const at = (hhmmVn: string, date = "2026-12-01") => {
  const [hour, minute] = hhmmVn.split(":").map(Number);
  return new Date(Date.UTC(2026, 11, Number(date.slice(8)), hour! - 7, minute!)).toISOString();
};

// ── In-memory fake của supabase-js (chỉ phần API module dùng) ───────────────
type Row = Record<string, unknown>;
interface Failure {
  code: string;
  message: string;
}
interface Result {
  data: unknown;
  error: Failure | null;
}

const TIME_KEYS = new Set(["starts_at", "ends_at"]);
const compareValue = (key: string, a: unknown, b: unknown) =>
  TIME_KEYS.has(key) ? Date.parse(String(a)) - Date.parse(String(b)) : a === b ? 0 : String(a) < String(b) ? -1 : 1;

class FakeDb {
  tables: Record<string, Row[]> = {};
  /** Cột mỗi lần `select(...)` vào showtime_seat_locks, để kiểm không dùng `select *`. */
  lockSelects: string[] = [];
  private nextId = 1000;

  reset() {
    this.nextId = 1000;
    this.lockSelects = [];
    this.tables = {
      user_roles: [{ user_id: ADMIN, role: "ADMIN" }],
      staff_assignments: [
        { user_id: MANAGER_HN01, cinema_id: HN01, role: "MANAGER" },
        { user_id: STAFF_HN01, cinema_id: HN01, role: "STAFF" },
      ],
      cinemas: [
        { id: HN01, cleaning_minutes: null, online_cutoff_minutes: null },
        { id: HN02, cleaning_minutes: null, online_cutoff_minutes: null },
      ],
      app_settings: [
        { key: "default_cleaning_minutes", value: 15 },
        { key: "default_online_cutoff_minutes", value: 15 },
      ],
      movies: [{ id: MOVIE, duration_minutes: 120, status: "PUBLISHED" }],
      rooms: [
        room(ROOM_HN01, HN01, "Phòng 1"),
        room(ROOM_HN01_B, HN01, "Phòng 2"),
        room(ROOM_HN02, HN02, "Phòng 1"),
      ],
      seats: [
        seat(SEAT_A1, ROOM_HN01, "A", 1, "NORMAL"),
        seat(SEAT_AISLE, ROOM_HN01, "A", 2, "AISLE"),
        seat(uuid(53), ROOM_HN02, "A", 1, "VIP"),
      ],
      showtimes: [showtime(SHOWTIME_1900, HN01, ROOM_HN01, at("19:00"))],
      showtime_seat_locks: [],
      showtime_seat_states: [],
      orders: [],
    };
  }

  from(table: string) {
    return new Query(this, table);
  }

  newId() {
    this.nextId += 1;
    return uuid(this.nextId);
  }

  /** Mô phỏng trigger/exclusion của migration catalog cho `showtimes` và `seats`, để test bắt lỗi DB thật. */
  beforeWrite(table: string, row: Row, existing?: Row): Failure | null {
    if (table === "showtimes") return this.validateShowtime(row, existing);
    if (table === "seats") {
      row.col_span = row.seat_type === "SWEETBOX" ? 2 : 1;
      const clash = (this.tables.seats ?? []).some(
        (other) => other !== existing && other.room_id === row.room_id && other.row_label === row.row_label && other.col_number === row.col_number,
      );
      return clash ? { code: "23P01", message: "seat overlap" } : null;
    }
    if (table === "showtime_seat_locks") {
      const dup = (this.tables.showtime_seat_locks ?? []).some(
        (other) => other.showtime_id === row.showtime_id && other.seat_id === row.seat_id,
      );
      return dup ? { code: "23505", message: "duplicate lock" } : null;
    }
    return null;
  }

  private validateShowtime(row: Row, existing?: Row): Failure | null {
    const movie = (this.tables.movies ?? []).find((m) => m.id === row.movie_id);
    const cinema = (this.tables.cinemas ?? []).find((c) => c.id === row.cinema_id);
    if (!movie) return { code: "23503", message: "movie missing" };
    const cleaning = (cinema?.cleaning_minutes as number | null) ?? 15;
    const startsAt = Date.parse(String(row.starts_at));
    row.ends_at = new Date(startsAt + ((movie.duration_minutes as number) + cleaning) * 60_000).toISOString();
    const endsAt = Date.parse(String(row.ends_at));
    const clash = (this.tables.showtimes ?? []).some(
      (other) =>
        other !== existing &&
        other.room_id === row.room_id &&
        other.status !== "CANCELLED" &&
        row.status !== "CANCELLED" &&
        startsAt < Date.parse(String(other.ends_at)) &&
        endsAt > Date.parse(String(other.starts_at)),
    );
    return clash ? { code: "23P01", message: "showtimes_room_id_tstzrange_excl" } : null;
  }
}

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] = {};
  private filters: ((row: Row) => boolean)[] = [];
  private orderKeys: string[] = [];
  private limitCount = Infinity;
  private mode: "many" | "one" | "maybe" = "many";
  private returning = true;

  constructor(
    private readonly db: FakeDb,
    private readonly table: string,
  ) {}

  select(columns?: string) {
    if (this.table === "showtime_seat_locks" && this.op === "select") this.db.lockSelects.push(columns ?? "*");
    if (this.op !== "select") this.returning = true;
    return this;
  }
  insert(payload: Row | Row[]) {
    this.op = "insert";
    this.payload = payload;
    this.returning = false;
    return this;
  }
  update(payload: Row) {
    this.op = "update";
    this.payload = payload;
    this.returning = false;
    return this;
  }
  delete() {
    this.op = "delete";
    this.returning = false;
    return this;
  }
  eq(key: string, value: unknown) {
    return this.filter((row) => row[key] === value);
  }
  neq(key: string, value: unknown) {
    return this.filter((row) => row[key] !== value);
  }
  in(key: string, values: unknown[]) {
    return this.filter((row) => values.includes(row[key]));
  }
  lt(key: string, value: unknown) {
    return this.filter((row) => compareValue(key, row[key], value) < 0);
  }
  gt(key: string, value: unknown) {
    return this.filter((row) => compareValue(key, row[key], value) > 0);
  }
  gte(key: string, value: unknown) {
    return this.filter((row) => compareValue(key, row[key], value) >= 0);
  }
  order(key: string) {
    this.orderKeys.push(key);
    return this;
  }
  limit(count: number) {
    this.limitCount = count;
    return this;
  }
  single() {
    this.mode = "one";
    return this;
  }
  maybeSingle() {
    this.mode = "maybe";
    return this;
  }
  then<A, B>(onFulfilled?: (value: Result) => A | PromiseLike<A>, onRejected?: (reason: unknown) => B | PromiseLike<B>) {
    return Promise.resolve(this.execute()).then(onFulfilled, onRejected);
  }

  private filter(predicate: (row: Row) => boolean) {
    this.filters.push(predicate);
    return this;
  }

  private matching(): Row[] {
    const rows = (this.db.tables[this.table] ?? []).filter((row) => this.filters.every((f) => f(row)));
    for (const key of [...this.orderKeys].reverse()) rows.sort((a, b) => compareValue(key, a[key], b[key]));
    return rows.slice(0, this.limitCount);
  }

  private shape(rows: Row[]): Result {
    if (this.mode === "many") return { data: rows.map((r) => ({ ...r })), error: null };
    if (this.mode === "one" && rows.length !== 1) return { data: null, error: { code: "PGRST116", message: "no rows" } };
    return { data: rows[0] ? { ...rows[0] } : null, error: null };
  }

  private execute(): Result {
    const store = (this.db.tables[this.table] ??= []);
    if (this.op === "select") return this.shape(this.matching());
    if (this.op === "insert") {
      const incoming = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((row) => ({
        id: this.db.newId(),
        status: this.table === "showtimes" ? "ON_SALE" : undefined,
        ...row,
      }));
      // Atomic: kiểm hết (kể cả chồng nhau trong cùng câu lệnh) rồi mới ghi.
      const staged: Row[] = [];
      for (const row of incoming) {
        const saved = [...store, ...staged];
        const original = this.db.tables[this.table];
        this.db.tables[this.table] = saved;
        const failure = this.db.beforeWrite(this.table, row);
        this.db.tables[this.table] = original ?? [];
        if (failure) return { data: null, error: failure };
        staged.push(row);
      }
      store.push(...staged);
      return this.returning ? this.shape(staged) : { data: null, error: null };
    }
    const targets = this.matching();
    if (this.op === "update") {
      for (const row of targets) {
        const next = { ...row, ...(this.payload as Row) };
        const failure = this.db.beforeWrite(this.table, next, row);
        if (failure) return { data: null, error: failure };
        Object.assign(row, next);
      }
      return this.returning ? this.shape(targets) : { data: null, error: null };
    }
    if (this.table === "rooms" && targets.some((r) => (this.db.tables.showtimes ?? []).some((s) => s.room_id === r.id))) {
      return { data: null, error: { code: "23503", message: "room in use" } };
    }
    this.db.tables[this.table] = store.filter((row) => !targets.includes(row));
    return this.returning ? this.shape(targets) : { data: null, error: null };
  }
}

function room(id: string, cinemaId: string, name: string): Row {
  return {
    id,
    cinema_id: cinemaId,
    name,
    supported_formats: ["2D", "3D"],
    status: "ACTIVE",
    grid_rows: 5,
    grid_cols: 8,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}
function seat(id: string, roomId: string, rowLabel: string, col: number, type: string): Row {
  return { id, room_id: roomId, row_label: rowLabel, col_number: col, seat_type: type, col_span: type === "SWEETBOX" ? 2 : 1, label: null };
}
function showtime(id: string, cinemaId: string, roomId: string, startsAt: string): Row {
  return {
    id,
    cinema_id: cinemaId,
    room_id: roomId,
    movie_id: MOVIE,
    starts_at: startsAt,
    ends_at: new Date(Date.parse(startsAt) + 135 * 60_000).toISOString(),
    format: "2D",
    language_mode: "SUBTITLED",
    status: "ON_SALE",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

// ── Test harness ────────────────────────────────────────────────────────────
const fakeDb = new FakeDb();
const fakeSupabase = { forUser: () => fakeDb, admin: () => fakeDb };

const sign = (sub: string) =>
  new SignJWT({ email: `${sub}@x.vn` })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("authenticated")
    .setIssuer(`${SUPABASE_URL}/auth/v1`)
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(JWT_SECRET));

describe("cinema-ops API", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RoomsController, ShowtimesController],
      providers: [
        { provide: ENV, useValue: { SUPABASE_JWT_SECRET: JWT_SECRET, SUPABASE_URL } as Env },
        { provide: SupabaseService, useValue: fakeSupabase },
        AccessService,
        SeatLayoutService,
        ShowtimesService,
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: CinemaScopeGuard },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useLogger(false);
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => fakeDb.reset());

  const call = async (method: "get" | "post" | "patch" | "put" | "delete", path: string, as: string, body?: object) => {
    const req = request(app.getHttpServer())[method](path).set("Authorization", `Bearer ${await sign(as)}`);
    return body ? req.send(body) : req;
  };
  const createShowtime = (as: string, cinemaId: string, roomId: string, time: string) =>
    call("post", `/cinemas/${cinemaId}/showtimes`, as, {
      roomId,
      movieId: MOVIE,
      startsAt: at(time),
      format: "2D",
      languageMode: "SUBTITLED",
    });
  const showtimeCount = () => fakeDb.tables.showtimes?.length;

  describe("showtimes: trùng phòng (AC-14, R-50)", () => {
    it("21:00 phòng HN01 đã có 19:00–21:15 -> 409 kèm suất trùng; cùng giờ ở HN02 -> 201", async () => {
      const clash = await createShowtime(MANAGER_HN01, HN01, ROOM_HN01, "21:00");
      expect(clash.status).toBe(409);
      expect(clash.body.error.code).toBe("CONFLICT");
      expect(clash.body.error.details.reason).toBe("SHOWTIME_OVERLAP");
      expect(clash.body.error.details.conflicts[0].conflictsWith[0].id).toBe(SHOWTIME_1900);
      expect(showtimeCount()).toBe(1);

      const ok = await createShowtime(ADMIN, HN02, ROOM_HN02, "21:00");
      expect(ok.status).toBe(201);
      expect(ok.body.endsAt).toBe(at("23:15")); // 21:00 + 120' phim + 15' dọn phòng
    });

    it("đúng giờ kết thúc 21:15 thì suất 21:15 liền kề được phép", async () => {
      expect((await createShowtime(MANAGER_HN01, HN01, ROOM_HN01, "21:15")).status).toBe(201);
    });

    it("dùng cleaning_minutes của rạp khi có override", async () => {
      fakeDb.tables.cinemas![0]!.cleaning_minutes = 45;
      const res = await createShowtime(MANAGER_HN01, HN01, ROOM_HN01_B, "10:00");
      expect(res.status).toBe(201);
      expect(res.body.endsAt).toBe(at("12:45")); // 120' + 45'
    });

    it("phòng của rạp khác trong path -> 404, không rò rạp", async () => {
      expect((await createShowtime(MANAGER_HN01, HN01, ROOM_HN02, "10:00")).status).toBe(404);
    });

    it("lỗi exclusion 23P01 từ DB (race) được dịch thành CONFLICT, 42501 thành FORBIDDEN_CINEMA", () => {
      expect(() => throwDbError({ code: "23P01", message: "x" })).toThrowError(expect.objectContaining({ code: "CONFLICT" }));
      expect(() => throwDbError({ code: "42501", message: "x" })).toThrowError(expect.objectContaining({ code: "FORBIDDEN_CINEMA" }));
      expect(() => throwDbError({ code: "23514", message: "Phòng đang bảo trì" })).toThrowError(
        expect.objectContaining({ code: "VALIDATION_ERROR" }),
      );
    });
  });

  describe("showtimes: hàng loạt (R-51)", () => {
    const bulk = (as: string, body: object) =>
      call("post", "/showtimes/bulk", as, {
        movieId: MOVIE,
        format: "2D",
        dates: ["2026-12-01", "2026-12-02"],
        times: ["19:00", "22:00"],
        targets: [{ cinemaId: HN01, roomIds: [ROOM_HN01] }],
        ...body,
      });

    it("có suất trùng + không bỏ qua -> 409 liệt kê cụ thể và KHÔNG tạo suất nào", async () => {
      const res = await bulk(MANAGER_HN01, {});
      expect(res.status).toBe(409);
      const conflicts = res.body.error.details.conflicts;
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]).toMatchObject({ roomId: ROOM_HN01, startsAt: at("19:00") });
      expect(conflicts[0].conflictsWith[0].id).toBe(SHOWTIME_1900);
      expect(showtimeCount()).toBe(1);
    });

    it("skipConflicts -> tạo 3 suất hợp lệ, báo 1 suất bị bỏ qua", async () => {
      const res = await bulk(MANAGER_HN01, { skipConflicts: true });
      expect(res.status).toBe(201);
      expect(res.body.created).toHaveLength(3);
      expect(res.body.skipped).toHaveLength(1);
      expect(showtimeCount()).toBe(4);
    });

    it("hai khung giờ chồng nhau trong cùng yêu cầu -> suất sau bị coi là trùng", async () => {
      const res = await bulk(MANAGER_HN01, {
        dates: ["2026-12-05"],
        times: ["10:00", "11:00"],
        targets: [{ cinemaId: HN01, roomIds: [ROOM_HN01_B] }],
        skipConflicts: true,
      });
      expect(res.status).toBe(201);
      expect(res.body.created).toHaveLength(1);
      expect(res.body.skipped[0].conflictsWith).toEqual([]);
    });

    it("Admin tạo cho nhiều rạp cùng lúc", async () => {
      const res = await bulk(ADMIN, {
        dates: ["2026-12-05"],
        times: ["10:00"],
        targets: [
          { cinemaId: HN01, roomIds: [ROOM_HN01_B] },
          { cinemaId: HN02, roomIds: [ROOM_HN02] },
        ],
      });
      expect(res.status).toBe(201);
      expect(res.body.created.map((s: { cinemaId: string }) => s.cinemaId).sort()).toEqual([HN01, HN02]);
    });

    it("Manager HN01 đưa rạp HN02 vào targets -> 403, không tạo gì", async () => {
      const res = await bulk(MANAGER_HN01, {
        dates: ["2026-12-05"],
        times: ["10:00"],
        targets: [
          { cinemaId: HN01, roomIds: [ROOM_HN01_B] },
          { cinemaId: HN02, roomIds: [ROOM_HN02] },
        ],
      });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN_CINEMA");
      expect(showtimeCount()).toBe(1);
    });

    it("Staff không được tạo hàng loạt; ngày không hợp lệ -> 400", async () => {
      expect((await bulk(STAFF_HN01, {})).status).toBe(403);
      const bad = await bulk(MANAGER_HN01, { dates: ["2026-02-30"] });
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("phân quyền theo rạp", () => {
    it("Manager HN01 thao tác phòng/suất của HN02 -> 403", async () => {
      expect((await call("get", `/cinemas/${HN02}/rooms`, MANAGER_HN01)).status).toBe(403);
      expect((await call("post", `/cinemas/${HN02}/rooms`, MANAGER_HN01, { name: "X", supportedFormats: ["2D"] })).status).toBe(403);
      expect((await createShowtime(MANAGER_HN01, HN02, ROOM_HN02, "10:00")).status).toBe(403);
      expect((await call("patch", `/cinemas/${HN02}/settings`, MANAGER_HN01, { cleaningMinutes: 5 })).status).toBe(403);
    });

    it("Staff đọc được nhưng không ghi được", async () => {
      expect((await call("get", `/cinemas/${HN01}/rooms`, STAFF_HN01)).status).toBe(200);
      expect((await call("post", `/cinemas/${HN01}/rooms`, STAFF_HN01, { name: "X", supportedFormats: ["2D"] })).status).toBe(403);
    });
  });

  describe("R-54: suất đã bán vé", () => {
    beforeEach(() => {
      fakeDb.tables.showtime_seat_states!.push({ showtime_id: SHOWTIME_1900, seat_id: SEAT_A1, state: "SOLD" });
    });
    const path = () => `/cinemas/${HN01}/showtimes/${SHOWTIME_1900}`;

    it("đổi giờ/phòng -> 409 SHOWTIME_HAS_SALES; dữ liệu giữ nguyên", async () => {
      const res = await call("patch", path(), MANAGER_HN01, { startsAt: at("20:00") });
      expect(res.status).toBe(409);
      expect(res.body.error.details.reason).toBe("SHOWTIME_HAS_SALES");
      expect(fakeDb.tables.showtimes![0]!.starts_at).toBe(at("19:00"));
    });

    it("xoá -> 409; đóng bán vẫn cho phép, mở bán lại được", async () => {
      expect((await call("delete", path(), MANAGER_HN01)).status).toBe(409);
      const closed = await call("post", `${path()}/close`, MANAGER_HN01);
      expect(closed.status).toBe(200);
      expect(closed.body.status).toBe("CLOSED");
      expect((await call("post", `${path()}/reopen`, MANAGER_HN01)).body.status).toBe("ON_SALE");
    });

    it("suất có đơn affected/refunded_manual (dù ghế đã nhả khỏi showtime_seat_states) vẫn chặn sửa/xoá -> 409 SHOWTIME_HAS_SALES", async () => {
      fakeDb.tables.showtime_seat_states = [];
      fakeDb.tables.orders = [{ id: uuid(901), showtime_id: SHOWTIME_1900, status: "refunded_manual" }];
      const editRes = await call("patch", path(), MANAGER_HN01, { startsAt: at("20:00") });
      expect(editRes.status).toBe(409);
      expect(editRes.body.error.details.reason).toBe("SHOWTIME_HAS_SALES");
      const delRes = await call("delete", path(), MANAGER_HN01);
      expect(delRes.status).toBe(409);
    });
  });

  describe("suất chưa bán", () => {
    it("sửa giờ được; sửa sang giờ trùng suất khác -> 409", async () => {
      const second = await createShowtime(MANAGER_HN01, HN01, ROOM_HN01, "22:00");
      const ok = await call("patch", `/cinemas/${HN01}/showtimes/${second.body.id}`, MANAGER_HN01, { startsAt: at("23:00") });
      expect(ok.status).toBe(200);
      const clash = await call("patch", `/cinemas/${HN01}/showtimes/${second.body.id}`, MANAGER_HN01, { startsAt: at("20:00") });
      expect(clash.status).toBe(409);
    });

    it("suất đã đóng/huỷ: đóng bán lặp là idempotent, huỷ rồi thì không đóng/khoá được", async () => {
      const path = `/cinemas/${HN01}/showtimes/${SHOWTIME_1900}`;
      await call("post", `${path}/close`, MANAGER_HN01);
      expect((await call("post", `${path}/close`, MANAGER_HN01)).status).toBe(200);
      fakeDb.tables.showtimes![0]!.status = "CANCELLED";
      const res = await call("post", `${path}/close`, MANAGER_HN01);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("SHOWTIME_CANCELLED");
    });
  });

  describe("sơ đồ ghế (R-48)", () => {
    const seatsPath = (roomId: string, cinemaId = HN01) => `/cinemas/${cinemaId}/rooms/${roomId}/seats`;

    it("Sweetbox chiếm 2 ô: chồng ô bên cạnh -> 400; vượt lưới -> 400", async () => {
      fakeDb.tables.showtimes = [];
      const overlap = await call("put", seatsPath(ROOM_HN01), MANAGER_HN01, {
        cells: [
          { row: "A", col: 1, type: "sweetbox" },
          { row: "A", col: 2, type: "standard" },
        ],
      });
      expect(overlap.status).toBe(400);
      const outside = await call("put", seatsPath(ROOM_HN01), MANAGER_HN01, { cells: [{ row: "A", col: 8, type: "sweetbox" }] });
      expect(outside.status).toBe(400);
      expect(outside.body.error.details.cell).toBe("A8");
    });

    it("lưu sơ đồ thay thế toàn bộ; ghế bán được có nhãn, lối đi thì không", async () => {
      fakeDb.tables.showtimes = [];
      const res = await call("put", seatsPath(ROOM_HN01), MANAGER_HN01, {
        cells: [
          { row: "A", col: 1, type: "vip" },
          { row: "A", col: 2, type: "aisle" },
          { row: "A", col: 3, type: "sweetbox" },
          { row: "B", col: 1, type: "broken" },
        ],
      });
      expect(res.status).toBe(200);
      expect(res.body.cells).toHaveLength(4);
      expect(res.body.cells.map((c: { label: string | null }) => c.label)).toEqual(["A1", null, "A3", null]);
      expect(res.body.cells[2]).toMatchObject({ type: "sweetbox", colSpan: 2 });
    });

    it("phòng còn suất sắp chiếu thì không đổi được sơ đồ", async () => {
      fakeDb.tables.showtimes = [showtime(SHOWTIME_1900, HN01, ROOM_HN01, new Date(Date.now() + 86_400_000).toISOString())];
      const res = await call("put", seatsPath(ROOM_HN01), MANAGER_HN01, { cells: [] });
      expect(res.status).toBe(409);
      expect(res.body.error.details.reason).toBe("ROOM_HAS_UPCOMING_SHOWTIMES");
    });

    it("sao chép sơ đồ từ phòng của rạp khác", async () => {
      fakeDb.tables.showtimes = [];
      const res = await call("post", `${seatsPath(ROOM_HN01)}/copy`, MANAGER_HN01, { sourceRoomId: ROOM_HN02 });
      expect(res.status).toBe(201);
      expect(res.body.cells).toHaveLength(1);
      expect(res.body.cells[0]).toMatchObject({ row: "A", col: 1, type: "vip" });
      expect(fakeDb.tables.seats!.filter((s) => s.room_id === ROOM_HN01 && s.cinema_id === HN01)).toHaveLength(1);
    });

    it("không sao chép từ phòng không tồn tại; sao chép vào phòng rạp khác -> 403", async () => {
      expect((await call("post", `${seatsPath(ROOM_HN01)}/copy`, MANAGER_HN01, { sourceRoomId: uuid(99) })).status).toBe(404);
      expect((await call("post", `${seatsPath(ROOM_HN02, HN02)}/copy`, MANAGER_HN01, { sourceRoomId: ROOM_HN01 })).status).toBe(403);
    });
  });

  describe("phòng (R-47)", () => {
    it("tạo, sửa trạng thái bảo trì, xoá; xoá phòng còn suất -> 409", async () => {
      const created = await call("post", `/cinemas/${HN01}/rooms`, MANAGER_HN01, { name: "Phòng 9", supportedFormats: ["2D"] });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ gridRows: 10, gridCols: 12, status: "ACTIVE" });

      const patched = await call("patch", `/cinemas/${HN01}/rooms/${created.body.id}`, MANAGER_HN01, { status: "MAINTENANCE" });
      expect(patched.body.status).toBe("MAINTENANCE");
      expect((await call("delete", `/cinemas/${HN01}/rooms/${created.body.id}`, MANAGER_HN01)).status).toBe(204);

      const inUse = await call("delete", `/cinemas/${HN01}/rooms/${ROOM_HN01}`, MANAGER_HN01);
      expect(inUse.status).toBe(409);
    });

    it("phòng bảo trì không nhận suất mới; định dạng không hỗ trợ -> 400", async () => {
      fakeDb.tables.rooms![1]!.status = "MAINTENANCE";
      expect((await createShowtime(MANAGER_HN01, HN01, ROOM_HN01_B, "10:00")).status).toBe(400);
      fakeDb.tables.rooms![0]!.supported_formats = ["2D"];
      const res = await call("post", `/cinemas/${HN01}/showtimes`, MANAGER_HN01, {
        roomId: ROOM_HN01,
        movieId: MOVIE,
        startsAt: at("10:00"),
        format: "3D",
      });
      expect(res.status).toBe(400);
    });
  });

  describe("khoá ghế (R-55)", () => {
    const locks = `/cinemas/${HN01}/showtimes/${SHOWTIME_1900}/locks`;

    it("khoá và mở khoá ghế; truy vấn khoá liệt kê cột tường minh (không select *)", async () => {
      const locked = await call("post", locks, MANAGER_HN01, { seatIds: [SEAT_A1], reason: "GUEST" });
      expect(locked.status).toBe(201);
      expect(locked.body[0]).toMatchObject({ seat_id: SEAT_A1, reason: "GUEST" });

      expect((await call("get", locks, STAFF_HN01)).body).toHaveLength(1);
      expect((await call("post", locks, MANAGER_HN01, { seatIds: [SEAT_A1] })).status).toBe(409);
      expect((await call("delete", `${locks}/${SEAT_A1}`, MANAGER_HN01)).status).toBe(204);
      expect((await call("delete", `${locks}/${SEAT_A1}`, MANAGER_HN01)).status).toBe(404);

      expect(fakeDb.lockSelects.length).toBeGreaterThan(0);
      for (const columns of fakeDb.lockSelects) {
        expect(columns).not.toBe("*");
        expect(columns).not.toContain("locked_by");
      }
    });

    it("không khoá lối đi, ghế phòng khác, ghế đã bán hoặc ghế đang HELD còn hạn (nhưng HELD hết hạn thì khoá được)", async () => {
      expect((await call("post", locks, MANAGER_HN01, { seatIds: [SEAT_AISLE] })).status).toBe(400);
      expect((await call("post", locks, MANAGER_HN01, { seatIds: [uuid(53)] })).status).toBe(400);
      fakeDb.tables.showtime_seat_states!.push({ showtime_id: SHOWTIME_1900, seat_id: SEAT_A1, state: "SOLD" });
      const sold = await call("post", locks, MANAGER_HN01, { seatIds: [SEAT_A1] });
      expect(sold.status).toBe(409);
      expect(sold.body.error.code).toBe("SEAT_TAKEN");

      fakeDb.tables.showtime_seat_states = [
        {
          showtime_id: SHOWTIME_1900,
          seat_id: SEAT_A1,
          state: "HELD",
          expires_at: new Date(Date.now() + 300_000).toISOString(),
        },
      ];
      const activeHold = await call("post", locks, MANAGER_HN01, { seatIds: [SEAT_A1] });
      expect(activeHold.status).toBe(409);
      expect(activeHold.body.error.code).toBe("SEAT_TAKEN");

      fakeDb.tables.showtime_seat_states = [
        {
          showtime_id: SHOWTIME_1900,
          seat_id: SEAT_A1,
          state: "HELD",
          expires_at: new Date(Date.now() - 60_000).toISOString(),
        },
      ];
      const expiredHold = await call("post", locks, MANAGER_HN01, { seatIds: [SEAT_A1] });
      expect(expiredHold.status).toBe(201);
    });

    it("Manager HN01 khoá ghế suất của HN02 -> 403", async () => {
      expect((await call("post", `/cinemas/${HN02}/showtimes/${SHOWTIME_1900}/locks`, MANAGER_HN01, { seatIds: [SEAT_A1] })).status).toBe(403);
    });
  });

  describe("cấu hình rạp (R-56)", () => {
    it("đặt, đọc (kèm giá trị hiệu lực) và trả về mặc định chuỗi bằng null", async () => {
      const set = await call("patch", `/cinemas/${HN01}/settings`, MANAGER_HN01, { cleaningMinutes: 30, onlineCutoffMinutes: 45 });
      expect(set.body).toMatchObject({ cleaningMinutes: 30, effectiveCleaningMinutes: 30, effectiveOnlineCutoffMinutes: 45 });

      const reset = await call("patch", `/cinemas/${HN01}/settings`, MANAGER_HN01, { cleaningMinutes: null });
      expect(reset.body).toMatchObject({ cleaningMinutes: null, effectiveCleaningMinutes: 15, onlineCutoffMinutes: 45 });
      expect((await call("get", `/cinemas/${HN01}/settings`, STAFF_HN01)).status).toBe(200);
    });

    it("giá trị ngoài khoảng -> 400", async () => {
      expect((await call("patch", `/cinemas/${HN01}/settings`, MANAGER_HN01, { cleaningMinutes: 999 })).status).toBe(400);
      expect((await call("patch", `/cinemas/${HN01}/settings`, MANAGER_HN01, {})).status).toBe(400);
    });
  });
});
