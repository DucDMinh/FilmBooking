import { execFileSync } from "node:child_process";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { SupabaseClient } from "@supabase/supabase-js";
import request from "supertest";
import { AppModule } from "../../../src/app.module";
import { configureApp } from "../../../src/config/configure-app";
import { ENV, parseEnv } from "../../../src/config/env";
import { TurnstileService } from "../../../src/modules/auth-ext/turnstile.service";
import { RESEND_CLIENT } from "../../../src/modules/mail/mail.service";
import type { LocalSupabaseEnv } from "./supabase-test";

export const JOB_SECRET = "it-job-secret";

export interface SentMail {
  to: string;
  subject: string;
  html: string;
}

export interface TestApp {
  app: INestApplication;
  /** Mail mà Resend mock CỦA APP NÀY nhận được (job của builder khác có thể gửi hộ -> chỉ dùng để kiểm nội dung). */
  sentMails: SentMail[];
}

/** Nest app thật + Supabase local; chỉ thay biên provider: Resend (không gọi mạng) và Turnstile (luôn pass). */
export async function bootTestApp(env: LocalSupabaseEnv): Promise<TestApp> {
  const sentMails: SentMail[] = [];
  const fakeResend = {
    emails: {
      send: async (payload: { to: string; subject: string; html: string }) => {
        sentMails.push({ to: payload.to, subject: payload.subject, html: payload.html });
        return { data: { id: `it-mail-${sentMails.length}` }, error: null };
      },
    },
  };
  const apiEnv = parseEnv({
    WEB_ORIGIN: "https://filmbooking.example.com",
    SUPABASE_URL: env.url,
    SUPABASE_ANON_KEY: env.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: env.serviceRoleKey,
    SUPABASE_JWT_SECRET: env.jwtSecret,
    SUPABASE_JWKS_URL: `${env.url}/auth/v1/.well-known/jwks.json`,
    JOB_SECRET,
    // Tin X-Forwarded-For để mỗi test tự đặt IP riêng, không dùng chung bucket rate limit theo IP với suite khác.
    TRUST_PROXY_HOPS: "1",
  });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue(apiEnv)
    .overrideProvider(RESEND_CLIENT)
    .useValue(fakeResend)
    .overrideProvider(TurnstileService)
    .useValue({ verify: async () => true })
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app, apiEnv);
  await app.init();
  return { app, sentMails };
}

/** Gọi job gửi mail đến khi mọi dòng outbox `ids` rời PENDING (job quét cả dòng của suite khác nên có thể cần nhiều lượt). */
export async function drainOutbox(app: INestApplication, admin: SupabaseClient, ids: string[]): Promise<void> {
  for (let round = 0; round < 20; round += 1) {
    const { data, error } = await admin.from("email_outbox").select("id, status").in("id", ids);
    if (error) throw error;
    if ((data ?? []).every((row) => row.status !== "PENDING")) return;
    await request(app.getHttpServer()).post("/jobs/send-emails?batchSize=100").set("x-job-secret", JOB_SECRET).expect(200);
  }
  throw new Error("drainOutbox: outbox vẫn PENDING sau 20 lượt job");
}

const DB_CONTAINER = "supabase_db_filmbooking";

/**
 * SQL trực tiếp vào DB local (dùng cho schema `auth` mà PostgREST không expose).
 * Hàm không tự kiểm local: chỉ chạy được với DB local vì đi qua `docker exec` vào container Supabase local;
 * guard URL local nằm ở `loadLocalSupabaseEnv` (caller đã qua bước đó trước khi chạy test).
 */
export function runLocalSql(sql: string): string {
  return execFileSync("docker", ["exec", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** Lọc mail Mailpit (Inbucket local, cổng 54324) gửi tới `email`; null khi Mailpit không truy cập được. */
export async function countLocalInbox(email: string): Promise<number | null> {
  try {
    const response = await fetch(`http://127.0.0.1:54324/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    return ((await response.json()) as { messages_count?: number }).messages_count ?? 0;
  } catch {
    return null;
  }
}
