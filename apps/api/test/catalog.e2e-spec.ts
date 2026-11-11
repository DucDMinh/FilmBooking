import { Global, Module, type INestApplication } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { SignJWT } from "jose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuthGuard } from "../src/common/auth/auth.guard";
import { AuthModule } from "../src/common/auth/auth.module";
import { CinemaScopeGuard } from "../src/common/auth/cinema-scope.guard";
import { RolesGuard } from "../src/common/auth/roles.guard";
import { AllExceptionsFilter } from "../src/common/errors/all-exceptions.filter";
import { SupabaseService } from "../src/common/supabase/supabase.service";
import { ENV, type Env } from "../src/config/env";
import { CatalogModule } from "../src/modules/catalog/catalog.module";
import { classifyMovie, sanitizeSearchTerm } from "../src/modules/catalog/movies.service";

const JWT_SECRET = "test-jwt-secret-test-jwt-secret-1234";
const SUPABASE_URL = "https://abc.supabase.co";
const ANON_KEY = "anon-key-for-test";
const HN01 = "11111111-1111-1111-1111-111111111111";
const HN02 = "22222222-2222-2222-2222-222222222222";
const ADMIN = "aaaaaaaa-0000-0000-0000-000000000001";
const MANAGER = "aaaaaaaa-0000-0000-0000-000000000002";
const MOVIE_ID = "33333333-3333-3333-3333-333333333333";

const userRoles = [{ user_id: ADMIN, role: "ADMIN" }];
const assignments = [{ user_id: MANAGER, cinema_id: HN01, role: "MANAGER" }];

type Operation = [method: string, args: unknown[]];
interface Query {
  table: string;
  ops: Operation[];
  jwt: string | "admin";
}
type Responder = (query: Query) => { data?: unknown; error?: { code?: string; message: string } | null; count?: number };

/** Mock supabase-js: mọi method chain được và ghi lại; `await` trả về kết quả do test đặt theo bảng + thao tác. */
function createFakeSupabase() {
  const queries: Query[] = [];
  const handlers = new Map<string, Responder>();

  const builder = (table: string, jwt: string): unknown => {
    const query: Query = { table, ops: [], jwt };
    queries.push(query);
    const proxy: unknown = new Proxy(
      {},
      {
        get: (_target, prop: string) => {
          if (prop === "then") {
            const result = handlers.get(`${table}:${query.ops[0]?.[0] ?? "select"}`)?.(query) ?? { data: [] };
            return (resolve: (value: unknown) => unknown) => resolve({ error: null, ...result });
          }
          return (...args: unknown[]) => {
            query.ops.push([prop, args]);
            return proxy;
          };
        },
      },
    );
    return proxy;
  };

  const service = {
    admin: () => ({ from: (table: string) => builder(table, "admin") }),
    forUser: (jwt: string) => ({ from: (table: string) => builder(table, jwt) }),
  };
  const roleHandlers = () => {
    handlers.set("user_roles:select", (q) => ({ data: userRoles.filter((r) => hasEq(q, "user_id", r.user_id)) }));
    handlers.set("staff_assignments:select", (q) => ({
      data: assignments.filter((r) => hasEq(q, "user_id", r.user_id)),
    }));
  };
  return {
    service,
    queries,
    on: (key: string, responder: Responder) => handlers.set(key, responder),
    reset: () => {
      queries.length = 0;
      handlers.clear();
      roleHandlers();
    },
  };
}

const hasEq = (query: Query, column: string, value: unknown) =>
  query.ops.some(([method, args]) => method === "eq" && args[0] === column && args[1] === value);
const lastQuery = (queries: Query[], table: string) => queries.filter((q) => q.table === table).at(-1);
const opArgs = (query: Query | undefined, method: string) =>
  query?.ops.filter(([name]) => name === method).map(([, args]) => args) ?? [];

const fake = createFakeSupabase();

@Global()
@Module({
  providers: [
    { provide: ENV, useValue: { SUPABASE_JWT_SECRET: JWT_SECRET, SUPABASE_URL, SUPABASE_ANON_KEY: ANON_KEY } as Env },
    { provide: SupabaseService, useValue: fake.service },
  ],
  exports: [ENV, SupabaseService],
})
class FakeInfraModule {}

const sign = (sub: string) =>
  new SignJWT({ email: `${sub}@x.vn` })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("authenticated")
    .setIssuer(`${SUPABASE_URL}/auth/v1`)
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(JWT_SECRET));

const cinemaRow = (overrides: Record<string, unknown> = {}) => ({
  id: HN01,
  code: "HN01",
  name: "Cinema Hà Nội 1",
  district: "Cầu Giấy",
  address: "1 Xuân Thủy",
  latitude: 21.03,
  longitude: 105.78,
  hotline: null,
  email: null,
  opening_hours: "09:00-23:00",
  image_url: null,
  amenities: ["IMAX"],
  status: "OPEN",
  provinces: { code: "HN" },
  ...overrides,
});

const movieRow = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  slug: `phim-${id}`,
  title_vi: `Phim ${id}`,
  title_original: null,
  poster_url: null,
  banner_url: `https://cdn.example.com/${id}.jpg`,
  trailer_url: null,
  description: null,
  genres: ["Hành động"],
  duration_minutes: 120,
  director: null,
  cast_members: [],
  country: null,
  original_language: null,
  subtitle_languages: [],
  dubbed_languages: [],
  release_date: "2020-01-01",
  age_rating: "T13",
  status: "PUBLISHED",
  ...overrides,
});

describe("catalog helpers", () => {
  it("classifies 'Sắp chiếu' per decision #13", () => {
    expect(classifyMovie("2999-01-01", false, "2026-11-11")).toBe("coming_soon");
    expect(classifyMovie("2999-01-01", true, "2026-11-11")).toBe("now_showing");
    expect(classifyMovie("2026-11-01", true, "2026-11-11")).toBe("now_showing");
    expect(classifyMovie("2026-11-01", false, "2026-11-11")).toBeNull();
    expect(classifyMovie("2026-11-11", false, "2026-11-11")).toBeNull();
  });

  it("strips PostgREST filter syntax from search terms", () => {
    expect(sanitizeSearchTerm("a,title_vi.eq.x)%")).not.toMatch(/[,()%.]/);
  });
});

describe("catalog API (e2e, mock Supabase)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FakeInfraModule, AuthModule, CatalogModule],
      providers: [
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

  beforeEach(() => fake.reset());

  const server = () => app.getHttpServer();
  const auth = async (sub: string) => `Bearer ${await sign(sub)}`;

  describe("public", () => {
    it("lists provinces without a token using the anon key", async () => {
      fake.on("provinces:select", () => ({ data: [{ code: "HN", name: "Hà Nội" }] }));
      const response = await request(server()).get("/provinces");
      expect(response.status).toBe(200);
      expect(response.body).toEqual([{ code: "HN", name: "Hà Nội" }]);
      expect(lastQuery(fake.queries, "provinces")?.jwt).toBe(ANON_KEY);
    });

    it("lists only OPEN cinemas, filtered by province (AC-19)", async () => {
      fake.on("cinemas:select", () => ({ data: [cinemaRow()] }));
      const response = await request(server()).get("/cinemas?province=HN");
      expect(response.status).toBe(200);
      expect(response.body[0]).toMatchObject({ code: "HN01", provinceCode: "HN", openingHours: "09:00-23:00" });
      expect(response.body[0]).toHaveProperty("id", HN01);
      const query = lastQuery(fake.queries, "cinemas");
      expect(opArgs(query, "eq")).toContainEqual(["status", "OPEN"]);
      expect(opArgs(query, "eq")).toContainEqual(["provinces.code", "HN"]);
    });

    it("rejects a malformed province", async () => {
      const response = await request(server()).get("/cinemas?province=hn;drop");
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 404 for a cinema that is not OPEN", async () => {
      fake.on("cinemas:select", () => ({ data: null }));
      const response = await request(server()).get("/cinemas/HN01");
      expect(response.status).toBe(404);
      expect(opArgs(lastQuery(fake.queries, "cinemas"), "eq")).toContainEqual(["status", "OPEN"]);
    });

    it("returns cinema detail with rooms and showtimes as UTC ISO", async () => {
      fake.on("cinemas:select", () => ({ data: cinemaRow() }));
      fake.on("rooms:select", () => ({
        data: [{ id: "r1", name: "Phòng 1", supported_formats: ["2D", "3D"], status: "ACTIVE" }],
      }));
      fake.on("showtimes:select", () => ({
        data: [
          {
            id: "s1",
            room_id: "r1",
            starts_at: "2026-11-14T10:00:00+00:00",
            ends_at: "2026-11-14T12:15:00+00:00",
            format: "2D",
            language_mode: "SUBTITLED",
            status: "ON_SALE",
            movies: { slug: "phim-a", title_vi: "Phim A", age_rating: "T13", poster_url: null, duration_minutes: 120 },
          },
        ],
      }));
      const response = await request(server()).get("/cinemas/HN01?date=2026-11-14");
      expect(response.status).toBe(200);
      expect(response.body.rooms[0]).toEqual({ id: "r1", name: "Phòng 1", supportedFormats: ["2D", "3D"], status: "ACTIVE" });
      expect(response.body.showtimes[0]).toMatchObject({
        startsAt: "2026-11-14T10:00:00.000Z",
        movie: { slug: "phim-a", titleVi: "Phim A" },
      });
      // 14/11 giờ VN = [13/11 17:00Z, 14/11 17:00Z)
      const range = lastQuery(fake.queries, "showtimes");
      expect(opArgs(range, "gte")).toContainEqual(["starts_at", "2026-11-13T17:00:00.000Z"]);
      expect(opArgs(range, "lt")).toContainEqual(["starts_at", "2026-11-14T17:00:00.000Z"]);
    });

    it("home splits now showing / coming soon by region (decision #13)", async () => {
      const showing = "00000000-0000-0000-0000-0000000000a1";
      const upcomingWithEarlyShow = "00000000-0000-0000-0000-0000000000a2";
      const upcoming = "00000000-0000-0000-0000-0000000000a3";
      const ended = "00000000-0000-0000-0000-0000000000a4";
      fake.on("movies:select", () => ({
        data: [
          movieRow(showing),
          movieRow(upcomingWithEarlyShow, { release_date: "2999-01-01" }),
          movieRow(upcoming, { release_date: "2999-02-01" }),
          movieRow(ended),
        ],
      }));
      fake.on("showtimes:select", () => ({
        data: [{ movie_id: showing }, { movie_id: upcomingWithEarlyShow }],
      }));
      const response = await request(server()).get("/home?province=HN");
      expect(response.status).toBe(200);
      expect(response.body.nowShowing.map((m: { id: string }) => m.id)).toEqual([showing, upcomingWithEarlyShow]);
      expect(response.body.comingSoon.map((m: { id: string }) => m.id)).toEqual([upcoming]);
      expect(response.body.banners.map((b: { slug: string }) => b.slug)).toEqual([`phim-${showing}`, `phim-${upcomingWithEarlyShow}`]);
      const showtimeQuery = lastQuery(fake.queries, "showtimes");
      expect(opArgs(showtimeQuery, "eq")).toContainEqual(["cinemas.provinces.code", "HN"]);
      expect(opArgs(showtimeQuery, "eq")).toContainEqual(["cinemas.status", "OPEN"]);
    });

    it("filters movies by text, genre, age and status", async () => {
      const upcoming = "00000000-0000-0000-0000-0000000000b1";
      const showing = "00000000-0000-0000-0000-0000000000b2";
      fake.on("movies:select", () => ({
        data: [movieRow(upcoming, { release_date: "2999-01-01" }), movieRow(showing)],
      }));
      fake.on("showtimes:select", () => ({ data: [{ movie_id: showing }] }));
      const response = await request(server()).get("/movies").query({
        q: "avengers,id.eq.1",
        genre: "Hành động",
        age: "T13",
        status: "coming_soon",
      });
      expect(response.status).toBe(200);
      expect(response.body.map((m: { id: string }) => m.id)).toEqual([upcoming]);
      const query = lastQuery(fake.queries, "movies");
      const orFilter = String(opArgs(query, "or")[0]?.[0]);
      expect(orFilter).toBe("title_vi.ilike.%avengers id eq 1%,title_original.ilike.%avengers id eq 1%");
      expect(opArgs(query, "contains")).toContainEqual(["genres", ["Hành động"]]);
      expect(opArgs(query, "eq")).toContainEqual(["age_rating", "T13"]);
      expect(opArgs(query, "eq")).toContainEqual(["status", "PUBLISHED"]);
    });

    it("returns movie detail grouped by cinema, 404 when unpublished", async () => {
      fake.on("movies:select", () => ({ data: movieRow(MOVIE_ID, { slug: "phim-a" }) }));
      fake.on("showtimes:select", (q) =>
        opArgs(q, "eq").some(([col]) => col === "movie_id")
          ? {
              data: [
                { id: "s1", room_id: "r1", starts_at: "2026-11-14T10:00:00Z", ends_at: "2026-11-14T12:00:00Z", format: "2D", language_mode: "DUBBED", status: "ON_SALE", cinemas: { code: "HN01", name: "HN 1" } },
                { id: "s2", room_id: "r2", starts_at: "2026-11-14T13:00:00Z", ends_at: "2026-11-14T15:00:00Z", format: "3D", language_mode: "SUBTITLED", status: "ON_SALE", cinemas: { code: "HN01", name: "HN 1" } },
                { id: "s3", room_id: "r3", starts_at: "2026-11-14T11:00:00Z", ends_at: "2026-11-14T13:00:00Z", format: "2D", language_mode: "SUBTITLED", status: "ON_SALE", cinemas: { code: "HN02", name: "HN 2" } },
              ],
            }
          : { data: [{ movie_id: MOVIE_ID }] },
      );
      const response = await request(server()).get("/movies/phim-a?date=2026-11-14");
      expect(response.status).toBe(200);
      expect(response.body.movie.availability).toBe("now_showing");
      expect(response.body.schedule).toHaveLength(2);
      expect(response.body.schedule[0].showtimes.map((s: { id: string }) => s.id)).toEqual(["s1", "s2"]);

      fake.on("movies:select", () => ({ data: null }));
      expect((await request(server()).get("/movies/khong-co")).status).toBe(404);
    });
  });

  describe("management", () => {
    const newCinema = {
      code: "HN03",
      provinceCode: "HN",
      name: "Cinema Hà Nội 3",
      address: "3 Láng Hạ",
    };

    it("requires authentication", async () => {
      expect((await request(server()).post("/admin/cinemas").send(newCinema)).status).toBe(401);
    });

    it("Admin creates a cinema with the caller's JWT (RLS stays on)", async () => {
      fake.on("provinces:select", () => ({ data: { id: "p-hn" } }));
      fake.on("cinemas:insert", () => ({ data: cinemaRow({ code: "HN03" }) }));
      const token = await sign(ADMIN);
      const response = await request(server()).post("/admin/cinemas").set("Authorization", `Bearer ${token}`).send(newCinema);
      expect(response.status).toBe(201);
      expect(response.body.code).toBe("HN03");
      const insert = lastQuery(fake.queries, "cinemas");
      expect(insert?.jwt).toBe(token);
      expect(opArgs(insert, "insert")[0]?.[0]).toMatchObject({ code: "HN03", province_id: "p-hn", status: "OPEN" });
    });

    it("Manager cannot create a cinema (403)", async () => {
      const response = await request(server())
        .post("/admin/cinemas")
        .set("Authorization", await auth(MANAGER))
        .send(newCinema);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN");
    });

    it("Manager of HN01 cannot PATCH HN02 (403)", async () => {
      const response = await request(server())
        .patch(`/admin/cinemas/${HN02}`)
        .set("Authorization", await auth(MANAGER))
        .send({ name: "Hacked" });
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("FORBIDDEN_CINEMA");
      expect(fake.queries.some((q) => q.table === "cinemas")).toBe(false);
    });

    it("Manager edits own cinema info but not status/code", async () => {
      fake.on("cinemas:update", () => ({ data: cinemaRow({ name: "Tên mới" }) }));
      const ok = await request(server())
        .patch(`/admin/cinemas/${HN01}`)
        .set("Authorization", await auth(MANAGER))
        .send({ name: "Tên mới", amenities: ["IMAX"] });
      expect(ok.status).toBe(200);
      expect(ok.body.name).toBe("Tên mới");

      const status = await request(server())
        .patch(`/admin/cinemas/${HN01}`)
        .set("Authorization", await auth(MANAGER))
        .send({ status: "CLOSED" });
      expect(status.status).toBe(403);
      expect(status.body.error.code).toBe("FORBIDDEN");
    });

    it("blocks closing a cinema that still has upcoming showtimes", async () => {
      fake.on("showtimes:select", () => ({ count: 3 }));
      const response = await request(server())
        .patch(`/admin/cinemas/${HN01}`)
        .set("Authorization", await auth(ADMIN))
        .send({ status: "TEMP_CLOSED" });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("CONFLICT");
      expect(response.body.error.details).toEqual({ upcomingShowtimes: 3 });
      expect(fake.queries.some((q) => q.table === "cinemas" && q.ops[0]?.[0] === "update")).toBe(false);
    });

    it("Admin closes a cinema once no upcoming showtimes remain", async () => {
      fake.on("showtimes:select", () => ({ count: 0 }));
      fake.on("cinemas:update", () => ({ data: cinemaRow({ status: "TEMP_CLOSED" }) }));
      const response = await request(server())
        .patch(`/admin/cinemas/${HN01}`)
        .set("Authorization", await auth(ADMIN))
        .send({ status: "TEMP_CLOSED" });
      expect(response.status).toBe(200);
      expect(response.body.status).toBe("TEMP_CLOSED");
    });

    it("validates cinema PATCH body", async () => {
      const response = await request(server())
        .patch(`/admin/cinemas/${HN01}`)
        .set("Authorization", await auth(ADMIN))
        .send({});
      expect(response.status).toBe(400);
    });

    it("movie CRUD is Admin only; create maps to snake_case columns", async () => {
      const body = { slug: "phim-moi", titleVi: "Phim mới", durationMinutes: 100, releaseDate: "2026-12-01", ageRating: "T16", cast: ["A"] };
      expect((await request(server()).post("/admin/movies").set("Authorization", await auth(MANAGER)).send(body)).status).toBe(403);

      fake.on("movies:insert", () => ({ data: movieRow(MOVIE_ID, { slug: "phim-moi", age_rating: "T16" }) }));
      const created = await request(server()).post("/admin/movies").set("Authorization", await auth(ADMIN)).send(body);
      expect(created.status).toBe(201);
      expect(opArgs(lastQuery(fake.queries, "movies"), "insert")[0]?.[0]).toMatchObject({
        title_vi: "Phim mới",
        cast_members: ["A"],
        status: "DRAFT",
      });

      fake.on("movies:update", () => ({ data: movieRow(MOVIE_ID, { age_rating: "T18" }) }));
      const patched = await request(server())
        .patch(`/admin/movies/${MOVIE_ID}`)
        .set("Authorization", await auth(ADMIN))
        .send({ ageRating: "T18" });
      expect(patched.status).toBe(200);
      expect(opArgs(lastQuery(fake.queries, "movies"), "update")[0]?.[0]).toEqual({ age_rating: "T18" });
    });

    it("deleting a movie that has showtimes returns CONFLICT", async () => {
      fake.on("movies:delete", () => ({ data: null, error: { code: "23503", message: "fk" } }));
      const response = await request(server())
        .delete(`/admin/movies/${MOVIE_ID}`)
        .set("Authorization", await auth(ADMIN));
      expect(response.status).toBe(409);
    });
  });
});
