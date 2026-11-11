import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// SWC thay transformer mặc định vì Nest cần decorator metadata (emitDecoratorMetadata).
export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts", "test/**/*.spec.ts", "test/**/*.e2e-spec.ts"],
    environment: "node",
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
