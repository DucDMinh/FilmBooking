import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertLocalSupabaseUrl } from "./local-guard";

export interface LocalSupabaseEnv {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  jwtSecret: string;
}

function envFromProcess(): LocalSupabaseEnv | null {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_JWT_SECRET) {
    return null;
  }
  return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY, jwtSecret: SUPABASE_JWT_SECRET };
}

function envFromSupabaseStatus(): LocalSupabaseEnv | null {
  try {
    // shell:true để Windows resolve pnpm.cmd; CLI global có thể cũ nên luôn đi qua pnpm.
    const output = execFileSync("pnpm", ["exec", "supabase", "status", "-o", "env"], {
      encoding: "utf8",
      shell: true,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 30_000,
    });
    const values = new Map<string, string>();
    for (const line of output.split(/\r?\n/)) {
      const match = /^([A-Z_]+)="?([^"]*)"?$/.exec(line.trim());
      if (match?.[1] && match[2] !== undefined) values.set(match[1], match[2]);
    }
    const url = values.get("API_URL");
    const anonKey = values.get("ANON_KEY");
    const serviceRoleKey = values.get("SERVICE_ROLE_KEY");
    const jwtSecret = values.get("JWT_SECRET");
    return url && anonKey && serviceRoleKey && jwtSecret ? { url, anonKey, serviceRoleKey, jwtSecret } : null;
  } catch {
    return null;
  }
}

async function isAuthReachable(url: string): Promise<boolean> {
  try {
    return (await fetch(`${url}/auth/v1/health`, { signal: AbortSignal.timeout(3000) })).ok;
  } catch {
    return false;
  }
}

/**
 * Trả về env Supabase local, hoặc null khi stack không chạy (Docker tắt) -> test tự skip, không fail.
 * Ưu tiên biến môi trường (CI), sau đó `supabase status`.
 * Throw khi: URL không phải local (mọi môi trường), hoặc stack không chạy mà đang ở CI (tránh CI xanh giả).
 */
export async function loadLocalSupabaseEnv(): Promise<LocalSupabaseEnv | null> {
  const env = envFromProcess() ?? envFromSupabaseStatus();
  if (env) assertLocalSupabaseUrl(env.url);
  if (!env || !(await isAuthReachable(env.url))) {
    const message = "[test:int] Supabase local không chạy (chạy `pnpm db:start`).";
    if (process.env.CI) throw new Error(`${message} Ở CI suite bắt buộc chạy, không được skip.`);
    console.warn(`${message} -> bỏ qua integration test.`);
    return null;
  }
  return env;
}

/** Dữ liệu test của 1 lần chạy mang prefix riêng để dọn chính xác, không đụng seed/dữ liệu khác. */
export interface RunScope {
  runId: string;
  /** vd `it_ab12cd_` — dùng cho email, tên. */
  prefix: string;
  /** vd `IT_AB12CD` — hợp lệ cho code tỉnh (`^[A-Z0-9_]{2,20}$`). */
  provinceCode: string;
  /** vd `ITAB12CD` (8 ký tự) — code rạp chỉ cho `^[A-Z0-9]{2,10}$`. Thêm 1 ký tự hậu tố để phân biệt rạp. */
  cinemaCodeBase: string;
  /** vd `it-ab12cd-` — dùng cho slug phim. */
  slugPrefix: string;
  /** Id user factory đã tạo: xoá theo id thay vì quét listUsers. */
  userIds: Set<string>;
}

export function createRunScope(): RunScope {
  const runId = randomBytes(4).toString("hex").slice(0, 6);
  return {
    runId,
    prefix: `it_${runId}_`,
    provinceCode: `IT_${runId.toUpperCase()}`,
    cinemaCodeBase: `IT${runId.toUpperCase()}`,
    slugPrefix: `it-${runId}-`,
    userIds: new Set(),
  };
}

export function createAdminClient(env: LocalSupabaseEnv): SupabaseClient {
  assertLocalSupabaseUrl(env.url);
  return createClient(env.url, env.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function createAnonClient(env: LocalSupabaseEnv): SupabaseClient {
  return createClient(env.url, env.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Mở N client độc lập (mỗi client 1 phiên đăng nhập riêng) để test đồng thời (vd tranh ghế). */
export async function signInClients(
  env: LocalSupabaseEnv,
  credentials: ReadonlyArray<{ email: string; password: string }>,
): Promise<SupabaseClient[]> {
  return Promise.all(
    credentials.map(async ({ email, password }) => {
      const client = createAnonClient(env);
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw new Error(`signIn ${email} thất bại: ${error.message}`);
      return client;
    }),
  );
}

/** Chạy `task(i)` đồng thời cho i = 0..count-1 và gom kết quả (không dừng khi 1 task lỗi). */
export function runInParallel<T>(count: number, task: (index: number) => Promise<T>): Promise<PromiseSettledResult<T>[]> {
  return Promise.allSettled(Array.from({ length: count }, (_, index) => task(index)));
}

/**
 * Dọn mọi thứ thuộc `scope`, theo thứ tự FK: payments/affected_order_actions -> đơn (cascade vé, ghế đơn) ->
 * suất -> rạp (cascade phòng, ghế, gán nhân sự) -> phim -> tỉnh -> user.
 * Vẫn cố xoá phần còn lại khi 1 bước lỗi, rồi throw gộp ở cuối để `afterAll` fail rõ ràng.
 */
export async function cleanupScope(admin: SupabaseClient, scope: RunScope): Promise<void> {
  const failures: string[] = [];
  const check = (step: string, error: { message: string } | null) => {
    if (error) failures.push(`${step}: ${error.message}`);
  };
  const ids = (rows: Array<{ id: string }> | null): string[] => (rows ?? []).map((row) => row.id);

  const cinemas = await admin.from("cinemas").select("id").like("code", `${scope.cinemaCodeBase}%`);
  check("select cinemas", cinemas.error);
  const cinemaIds = ids(cinemas.data);

  if (cinemaIds.length > 0) {
    const orders = await admin.from("orders").select("id").in("cinema_id", cinemaIds);
    check("select orders", orders.error);
    const orderIds = ids(orders.data);
    if (orderIds.length > 0) {
      check("delete affected_order_actions", (await admin.from("affected_order_actions").delete().in("order_id", orderIds)).error);
      check("delete payments", (await admin.from("payments").delete().in("order_id", orderIds)).error);
      check("delete orders", (await admin.from("orders").delete().in("id", orderIds)).error);
    }
    check("delete showtimes", (await admin.from("showtimes").delete().in("cinema_id", cinemaIds)).error);
    check("delete cinemas", (await admin.from("cinemas").delete().in("id", cinemaIds)).error);
  }
  check("delete movies", (await admin.from("movies").delete().like("slug", `${scope.slugPrefix}%`)).error);
  check("delete provinces", (await admin.from("provinces").delete().eq("code", scope.provinceCode)).error);

  for (const userId of scope.userIds) {
    check(`deleteUser ${userId}`, (await admin.auth.admin.deleteUser(userId)).error);
  }

  if (failures.length > 0) {
    throw new Error(`cleanupScope(${scope.prefix}) còn sót dữ liệu:\n${failures.join("\n")}`);
  }
}
