import { Module } from "@nestjs/common";
import { createClient } from "@supabase/supabase-js";
import { ENV, type Env } from "../../config/env";
import { AuthExtController } from "./auth-ext.controller";
import { AuthExtService, SUPABASE_ANON_CLIENT } from "./auth-ext.service";
import { TurnstileService } from "./turnstile.service";

/** ENV và SupabaseService là global (AppConfigModule/SupabaseModule). Wiring vào AppModule do task khác. */
@Module({
  controllers: [AuthExtController],
  providers: [
    AuthExtService,
    TurnstileService,
    {
      provide: SUPABASE_ANON_CLIENT,
      inject: [ENV],
      useFactory: (env: Env) =>
        createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        }),
    },
  ],
  exports: [AuthExtService],
})
export class AuthExtModule {}
