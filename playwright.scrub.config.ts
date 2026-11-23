import { rmSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * Kiểm chuyển động theo cuộn (AC-32, NFR-19) KHÔNG cần Supabase/Postgres/API thật:
 * web build chạy với mock API (e2e/scrub/mock-api.mjs). Chạy: `pnpm exec playwright test -c playwright.scrub.config.ts`.
 * Cổng riêng (web 3105, mock 4010) và thư mục build riêng (`.next/scrub`) nên không đụng dev server đang mở.
 * `SCRUB_SKIP_BUILD=1` dùng lại bản build cũ trong `.next/scrub`.
 */
const WEB_PORT = Number(process.env.SCRUB_WEB_PORT ?? 3105);
const API_PORT = Number(process.env.SCRUB_API_PORT ?? 4010);
const WEB_URL = `http://localhost:${WEB_PORT}`;
const API_URL = `http://localhost:${API_PORT}`;
const DIST_DIR = ".next/scrub";

process.env.SCRUB_WEB_URL = WEB_URL;

// Cache dữ liệu (fetch revalidate 60s) của bản build scrub nằm trên đĩa và sống qua các lần chạy. Xoá trước khi khởi server (chỉ ở tiến trình
// điều phối, không phải worker) để mọi route "lần đầu" của nav-skeleton.spec.ts thật sự gọi mock API (đã làm chậm), không đọc lại bản cũ.
if (process.env.TEST_WORKER_INDEX === undefined) {
  rmSync(`apps/web/${DIST_DIR}/cache/fetch-cache`, { recursive: true, force: true });
}

const webEnv = {
  NEXT_DIST_DIR: DIST_DIR,
  // Trỏ Supabase vào cổng không ai nghe: khách không có phiên nên không có cuộc gọi nào, và tuyệt đối không chạm DB thật.
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54399",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "scrub-test-anon-key",
  NEXT_PUBLIC_API_URL: API_URL,
  API_URL,
  NEXT_PUBLIC_SITE_URL: WEB_URL,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  NEXT_TELEMETRY_DISABLED: "1",
};

const startWeb = `pnpm --filter ./apps/web exec next start -p ${WEB_PORT}`;

export default defineConfig({
  testDir: "./e2e/scrub",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: { baseURL: WEB_URL, locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node e2e/scrub/mock-api.mjs",
      url: `${API_URL}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { SCRUB_API_PORT: String(API_PORT) },
      stdout: "pipe", // để thấy dòng [mock] khi bật SCRUB_API_LOG=1
    },
    {
      command: process.env.SCRUB_SKIP_BUILD ? startWeb : `pnpm --filter ./apps/web exec next build && ${startWeb}`,
      url: `${WEB_URL}/dang-nhap`,
      reuseExistingServer: false,
      timeout: 600_000,
      env: webEnv,
    },
  ],
});
