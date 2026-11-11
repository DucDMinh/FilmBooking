import { Global, Module } from "@nestjs/common";
import { z } from "zod";

/** Injection token cho env đã validate. Mọi service đọc cấu hình qua token này, không đọc process.env. */
export const ENV = Symbol("ENV");

const requiredString = z.string().min(1);
const optionalString = z.string().min(1).optional();

const webOrigins = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((origin) => origin.trim().replace(/\/+$/, ""))
      .filter(Boolean),
  )
  .pipe(z.array(z.url()).min(1));

/**
 * Biến "optional" bên dưới thuộc về các module chưa có (PayOS, mail, captcha, job, Sentry):
 * task sở hữu module đó siết thành required khi thật sự dùng.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    WEB_ORIGIN: webOrigins,
    SUPABASE_URL: z.url(),
    SUPABASE_ANON_KEY: requiredString,
    SUPABASE_SERVICE_ROLE_KEY: requiredString,
    SUPABASE_JWT_SECRET: requiredString,
    PAYOS_CLIENT_ID: optionalString,
    PAYOS_API_KEY: optionalString,
    PAYOS_CHECKSUM_KEY: optionalString,
    RESEND_API_KEY: optionalString,
    TURNSTILE_SECRET_KEY: optionalString,
    JOB_SECRET: optionalString,
    SENTRY_DSN: optionalString,
  })
  .superRefine((env, ctx) => {
    // Hai khóa trùng nhau nghĩa là cấu hình sai: forUser() sẽ vô tình mang quyền service role.
    if (env.SUPABASE_ANON_KEY === env.SUPABASE_SERVICE_ROLE_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["SUPABASE_SERVICE_ROLE_KEY"],
        message: "must differ from SUPABASE_ANON_KEY",
      });
    }
  });

export type Env = z.output<typeof envSchema>;

function variableName(issue: z.core.$ZodIssue): string {
  return String(issue.path[0] ?? "(root)");
}

/** Lỗi cấu hình: message chỉ chứa TÊN biến + lý do, tuyệt đối không chứa giá trị. */
export class EnvValidationError extends Error {
  readonly variables: string[];

  constructor(issues: readonly z.core.$ZodIssue[]) {
    const lines = issues.map((issue) => `${variableName(issue)}: ${issue.message}`);
    super(`Invalid environment configuration -> ${lines.join("; ")}`);
    this.name = "EnvValidationError";
    this.variables = [...new Set(issues.map(variableName))];
  }
}

/** Chuỗi rỗng coi như chưa đặt (vd `FOO=` trong .env). */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  const present = Object.fromEntries(
    Object.entries(raw).filter(([, value]) => value !== undefined && value !== ""),
  );
  const result = envSchema.safeParse(present);
  if (!result.success) throw new EnvValidationError(result.error.issues);
  return result.data;
}

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: (): Env => parseEnv(process.env) }],
  exports: [ENV],
})
export class AppConfigModule {}
