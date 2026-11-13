import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// Integration test chạy với Supabase local (`pnpm db:start`). Tách khỏi `pnpm test` mặc định.
// Các file dùng chung DB local nên chạy tuần tự (dữ liệu đã cô lập theo prefix, nhưng tránh tranh tài nguyên).
export default defineConfig({
  test: {
    include: ["test/integration/**/*.int-spec.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  plugins: [
    swc.vite({
      jsc: {
        target: "es2022",
        parser: { syntax: "typescript", decorators: true },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
          useDefineForClassFields: false,
        },
      },
    }),
  ],
});
