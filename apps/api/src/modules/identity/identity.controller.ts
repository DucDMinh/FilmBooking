import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";
import {
  addPasswordInputSchema,
  linkIdentityInputSchema,
  missingEmailOAuthInputSchema,
  oauthCallbackVerifyInputSchema,
  unlinkProviderSchema,
  type AddPasswordInput,
  type IdentityListResponse,
  type LinkIdentityInput,
  type MissingEmailOAuthInput,
  type OAuthCallbackVerifyInput,
  type UnlinkProvider,
} from "@filmbooking/shared/schemas/identity";
import { CurrentUser, Public, type AuthUser } from "../../common/auth/decorators";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { IdentityService } from "./identity.service";

interface IpRequest {
  ip?: string;
}

@Controller()
export class IdentityController {
  constructor(@Inject(IdentityService) private readonly identityService: IdentityService) {}

  @Get("me/identities")
  getIdentities(@CurrentUser() user: AuthUser): Promise<IdentityListResponse> {
    return this.identityService.getIdentities(user);
  }

  @Post("me/identities/link")
  @HttpCode(200)
  linkIdentity(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(linkIdentityInputSchema)) body: LinkIdentityInput,
  ): Promise<{ success: boolean; provider: string }> {
    return this.identityService.linkIdentity(user, body);
  }

  @Delete("me/identities/:provider")
  @HttpCode(200)
  unlinkIdentity(
    @CurrentUser() user: AuthUser,
    @Param("provider", new ZodValidationPipe(unlinkProviderSchema)) provider: UnlinkProvider,
  ): Promise<{ success: boolean; unlinkedProvider: string }> {
    return this.identityService.unlinkIdentity(user, provider);
  }

  @Post("me/password")
  @HttpCode(200)
  addPassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(addPasswordInputSchema)) body: AddPasswordInput,
  ): Promise<{ success: boolean; message: string }> {
    return this.identityService.addPassword(user, body);
  }

  @Public()
  @Post("auth/oauth/missing-email")
  @HttpCode(200)
  missingEmail(
    @Body(new ZodValidationPipe(missingEmailOAuthInputSchema)) body: MissingEmailOAuthInput,
    @Req() req: IpRequest,
  ): Promise<{ status: "CHECK_EMAIL"; message: string }> {
    return this.identityService.handleMissingEmail(body, req.ip);
  }

  // Không @Public (R-12): endpoint chỉ trả thông tin về chính user đang đăng nhập, tránh oracle dò email.
  @Post("auth/oauth/callback-check")
  @HttpCode(200)
  checkOAuthCallback(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(oauthCallbackVerifyInputSchema)) body: OAuthCallbackVerifyInput,
  ): Promise<{ ok: boolean; action: "PROCEED" }> {
    return this.identityService.checkOAuthCallback(user, body);
  }
}
