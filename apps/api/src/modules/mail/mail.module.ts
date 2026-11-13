import { Module } from "@nestjs/common";
import { Resend } from "resend";
import { AppConfigModule, ENV, type Env } from "../../config/env";
import { MailService, RESEND_CLIENT } from "./mail.service";

@Module({
  imports: [AppConfigModule],
  providers: [
    {
      provide: RESEND_CLIENT,
      inject: [ENV],
      useFactory: (env: Env): Resend | null => {
        if (!env.RESEND_API_KEY) return null;
        return new Resend(env.RESEND_API_KEY);
      },
    },
    MailService,
  ],
  exports: [MailService, RESEND_CLIENT],
})
export class MailModule {}
