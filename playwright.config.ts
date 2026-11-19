import { execFileSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E trên web + api + Supabase local. Cổng mặc định 3100 (web) / 3101 (api) để không đụng cổng dev/Lighthouse.
 * Supabase local phải đang chạy (`pnpm db:start`); khoá lấy từ `supabase status` (CLI chạy qua pnpm vì bản global cũ).
 */
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3100);
const API_PORT = Number(process.env.E2E_API_PORT ?? 3101);
const WEB_URL = `http://localhost:${WEB_PORT}`;
const API_URL = `http://localhost:${API_PORT}`;

function readSupabaseEnv(): Record<string, string> {
  if (process.env.E2E_SUPABASE_URL) {
    return {
      API_URL: process.env.E2E_SUPABASE_URL,
      ANON_KEY: process.env.E2E_SUPABASE_ANON_KEY ?? "",
      SERVICE_ROLE_KEY: process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? "",
      JWT_SECRET: process.env.E2E_SUPABASE_JWT_SECRET ?? "",
    };
  }
  const output = execFileSync("pnpm", ["exec", "supabase", "status", "-o", "env"], {
    encoding: "utf8",
    shell: true,
    stdio: ["ignore", "pipe", "ignore"],
  });
  const values: Record<string, string> = {};
  for (const line of output.split(/\r?\n/)) {
    const match = /^([A-Z_]+)="?([^"]*)"?$/.exec(line.trim());
    if (match?.[1] && match[2] !== undefined) values[match[1]] = match[2];
  }
  return values;
}

const supabase = readSupabaseEnv();
// Worker thừa kế process.env từ tiến trình chính -> e2e/support/data.ts đọc lại được mà không gọi CLI lần nữa.
process.env.E2E_SUPABASE_URL = supabase.API_URL;
process.env.E2E_SUPABASE_ANON_KEY = supabase.ANON_KEY;
process.env.E2E_SUPABASE_SERVICE_ROLE_KEY = supabase.SERVICE_ROLE_KEY;
process.env.E2E_SUPABASE_JWT_SECRET = supabase.JWT_SECRET;
process.env.E2E_WEB_URL = WEB_URL;
process.env.E2E_API_URL = API_URL;

// Một nguồn duy nhất: API verify chữ ký bằng key này, e2e/support/data.ts đọc lại từ env để ký webhook giả.
const PAYOS_CHECKSUM_KEY = "e2e-payos-checksum-key";
process.env.E2E_PAYOS_CHECKSUM_KEY = PAYOS_CHECKSUM_KEY;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "*.spec.ts",
  // e2e/scrub chạy bằng playwright.scrub.config.ts (mock API, không cần Supabase).
  testIgnore: "scrub/**",
  globalTeardown: "./e2e/support/global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile-360",
      // 360px: viewport hẹp nhất theo spec; dùng Chromium (không WebKit) nên chỉ mô phỏng kích thước + cảm ứng.
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 740 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @filmbooking/api build && node apps/api/dist/apps/api/src/main.js",
      url: `${API_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      env: {
        NODE_ENV: "test",
        PORT: String(API_PORT),
        WEB_ORIGIN: WEB_URL,
        SUPABASE_URL: supabase.API_URL ?? "",
        SUPABASE_ANON_KEY: supabase.ANON_KEY ?? "",
        SUPABASE_SERVICE_ROLE_KEY: supabase.SERVICE_ROLE_KEY ?? "",
        SUPABASE_JWT_SECRET: supabase.JWT_SECRET ?? "",
        SUPABASE_JWKS_URL: `${supabase.API_URL}/auth/v1/.well-known/jwks.json`,
        PAYOS_CHECKSUM_KEY,
        JOB_SECRET: "e2e-job-secret",
        TRUST_PROXY_HOPS: "1",
      },
    },
    {
      command: `pnpm --filter @filmbooking/web build && pnpm --filter @filmbooking/web exec next start -p ${WEB_PORT}`,
      url: `${WEB_URL}/dang-nhap`,
      reuseExistingServer: !process.env.CI,
      timeout: 360_000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: supabase.API_URL ?? "",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: supabase.ANON_KEY ?? "",
        NEXT_PUBLIC_API_URL: API_URL,
        API_URL,
        NEXT_PUBLIC_SITE_URL: WEB_URL,
      },
    },
  ],
});
