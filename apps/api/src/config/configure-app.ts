import type { INestApplication } from "@nestjs/common";
import helmet from "helmet";
import type { Env } from "./env";

/** Middleware dùng chung cho main.ts và e2e test: header bảo mật + CORS chỉ cho origin web. */
export function configureApp(app: INestApplication, env: Pick<Env, "WEB_ORIGIN">): void {
  app.use(helmet());
  // Auth bằng Bearer header (không cookie) nên không bật credentials.
  app.enableCors({ origin: env.WEB_ORIGIN });
}
