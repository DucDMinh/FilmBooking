import { Module } from "@nestjs/common";
import { AppConfigModule, ENV, type Env } from "../../config/env";
import { MAIL_TRANSPORT, MailService, type MailTransport } from "./mail.service";
import { createMailTransport } from "./mail.transport";

@Module({
  imports: [AppConfigModule],
  providers: [
    {
      provide: MAIL_TRANSPORT,
      inject: [ENV],
      useFactory: (env: Env): MailTransport | null => createMailTransport(env),
    },
    MailService,
  ],
  exports: [MailService, MAIL_TRANSPORT],
})
export class MailModule {}
