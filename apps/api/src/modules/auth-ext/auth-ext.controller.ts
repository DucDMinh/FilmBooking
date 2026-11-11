import { Body, Controller, HttpCode, Inject, Post, Req } from "@nestjs/common";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendConfirmationSchema,
  resetPasswordSchema,
  type AuthNeutralResponse,
  type AuthSessionResponse,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResendConfirmationInput,
  type ResetPasswordInput,
} from "@filmbooking/shared/schemas/auth";
import { Public } from "../../common/auth/decorators";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { AuthExtService } from "./auth-ext.service";

/**
 * IP lấy từ `req.ip`. Giới hạn đã biết: Next gọi Nest qua proxy `/api/proxy` nên IP thấy được là của
 * server Next; follow-up layer 5 phải truyền IP khách (X-Forwarded-For + `trust proxy` đúng hop).
 */
interface IpRequest {
  ip?: string;
}

/** Toàn bộ endpoint công khai: bảo vệ bằng Turnstile + rate limit chứ không bằng JWT. */
@Public()
@Controller("auth")
export class AuthExtController {
  constructor(@Inject(AuthExtService) private readonly auth: AuthExtService) {}

  @Post("register")
  @HttpCode(202)
  register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() req: IpRequest,
  ): Promise<AuthNeutralResponse> {
    return this.auth.register(body, req.ip);
  }

  /** Trả session cho Route Handler của Next để đặt cookie HttpOnly. */
  @Post("login")
  @HttpCode(200)
  login(@Body(new ZodValidationPipe(loginSchema)) body: LoginInput, @Req() req: IpRequest): Promise<AuthSessionResponse> {
    return this.auth.login(body, req.ip);
  }

  @Post("resend-confirmation")
  @HttpCode(202)
  resend(
    @Body(new ZodValidationPipe(resendConfirmationSchema)) body: ResendConfirmationInput,
    @Req() req: IpRequest,
  ): Promise<AuthNeutralResponse> {
    return this.auth.resendConfirmation(body, req.ip);
  }

  @Post("forgot-password")
  @HttpCode(202)
  forgot(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
    @Req() req: IpRequest,
  ): Promise<AuthNeutralResponse> {
    return this.auth.forgotPassword(body, req.ip);
  }

  @Post("reset-password")
  @HttpCode(200)
  reset(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
    @Req() req: IpRequest,
  ): Promise<{ status: "PASSWORD_UPDATED" }> {
    return this.auth.resetPassword(body, req.ip);
  }
}
