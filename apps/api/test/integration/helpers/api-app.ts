import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../../src/app.module";
import { configureApp } from "../../../src/config/configure-app";
import { ENV, parseEnv } from "../../../src/config/env";
import type { LocalSupabaseEnv } from "./supabase-test";

export interface RunningApi {
  app: INestApplication;
  /** Base URL của server thật đang listen (cổng ngẫu nhiên) — dùng cho test tải, tránh supertest mở server mỗi request. */
  baseUrl: string;
}

/** Nest app thật + Supabase local, có listen cổng ngẫu nhiên. TRUST_PROXY_HOPS=1 để mỗi client giả lập IP riêng qua X-Forwarded-For. */
export async function startApi(env: LocalSupabaseEnv): Promise<RunningApi> {
  const apiEnv = parseEnv({
    WEB_ORIGIN: "https://filmbooking.example.com",
    SUPABASE_URL: env.url,
    SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
    SUPABASE_JWT_SECRET: env.jwtSecret,
    SUPABASE_JWKS_URL: `${env.url}/auth/v1/.well-known/jwks.json`,
    TRUST_PROXY_HOPS: "1",
  });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ENV).useValue(apiEnv).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app, apiEnv);
  await app.init();
  await app.listen(0, "127.0.0.1");
  return { app, baseUrl: (await app.getUrl()).replace("[::1]", "127.0.0.1") };
}

export interface HoldAttempt {
  status: number;
  body: { orderId?: string; holdExpiresAt?: string; code?: string; error?: { code?: string } } & Record<string, unknown>;
  ms: number;
}

/** POST /bookings/holds như 1 client web riêng (IP riêng theo `clientIp`), đo thời gian phản hồi. */
export async function postHold(
  baseUrl: string,
  accessToken: string,
  clientIp: string,
  payload: { showtimeId: string; seatIds: string[] },
): Promise<HoldAttempt> {
  const startedAt = performance.now();
  const res = await fetch(`${baseUrl}/bookings/holds`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, "X-Forwarded-For": clientIp },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as HoldAttempt["body"];
  return { status: res.status, body, ms: performance.now() - startedAt };
}

export function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
}

/** Chạy `task` cho từng phần tử với tối đa `limit` việc đồng thời (tạo hàng trăm user GoTrue mà không dồn 1 lúc). */
export async function mapLimit<T, R>(items: readonly T[], limit: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index] as T, index);
    }
  });
  await Promise.all(workers);
  return results;
}
