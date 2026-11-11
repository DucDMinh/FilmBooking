import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Put, type PipeTransform } from "@nestjs/common";
import {
  avatarUploadSchema,
  changeEmailSchema,
  cinemaIdParamSchema,
  deleteAccountSchema,
  updatePreferencesSchema,
  updateProfileSchema,
  updateProvinceSchema,
  type AvatarUploadInput,
  type ChangeEmailInput,
  type DeleteAccountInput,
  type UpdatePreferencesInput,
  type UpdateProfileInput,
  type UpdateProvinceInput,
} from "@filmbooking/shared/schemas/profile";
import type { z } from "zod";
import { CurrentUser, type AuthUser } from "../../common/auth/decorators";
import { ProfileService, unprocessable } from "./profile.service";

/** Như ZodValidationPipe nhưng trả 422 (acceptance của R-26/R-28) và gộp lý do vào message. */
class Unprocessable422Pipe<TSchema extends z.ZodType> implements PipeTransform<unknown, z.output<TSchema>> {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.output<TSchema> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    const reasons = result.error.issues.map((issue) => `${issue.path.map(String).join(".") || "body"}: ${issue.message}`);
    throw unprocessable(reasons.join("; "));
  }
}

/** AuthGuard global (APP_GUARD) đã xác thực; mọi route dưới `/me` thao tác trên chính user trong JWT. */
@Controller("me")
export class ProfileController {
  constructor(@Inject(ProfileService) private readonly profiles: ProfileService) {}

  @Get("profile")
  get(@CurrentUser() user: AuthUser) {
    return this.profiles.getProfile(user);
  }

  @Patch("profile")
  update(@CurrentUser() user: AuthUser, @Body(new Unprocessable422Pipe(updateProfileSchema)) body: UpdateProfileInput) {
    return this.profiles.updateProfile(user, body);
  }

  @Post("email")
  changeEmail(@CurrentUser() user: AuthUser, @Body(new Unprocessable422Pipe(changeEmailSchema)) body: ChangeEmailInput) {
    return this.profiles.requestEmailChange(user, body.newEmail);
  }

  @Post("avatar")
  avatar(@CurrentUser() user: AuthUser, @Body(new Unprocessable422Pipe(avatarUploadSchema)) body: AvatarUploadInput) {
    return this.profiles.createAvatarUpload(user, body);
  }

  @Put("preferences")
  preferences(
    @CurrentUser() user: AuthUser,
    @Body(new Unprocessable422Pipe(updatePreferencesSchema)) body: UpdatePreferencesInput,
  ) {
    return this.profiles.updatePreferences(user, body.marketingOptIn);
  }

  @Put("favorites/:cinemaId")
  addFavorite(@CurrentUser() user: AuthUser, @Param("cinemaId", new Unprocessable422Pipe(cinemaIdParamSchema)) id: string) {
    return this.profiles.addFavorite(user, id);
  }

  @Delete("favorites/:cinemaId")
  removeFavorite(
    @CurrentUser() user: AuthUser,
    @Param("cinemaId", new Unprocessable422Pipe(cinemaIdParamSchema)) id: string,
  ) {
    return this.profiles.removeFavorite(user, id);
  }

  @Put("province")
  province(@CurrentUser() user: AuthUser, @Body(new Unprocessable422Pipe(updateProvinceSchema)) body: UpdateProvinceInput) {
    return this.profiles.updateProvince(user, body.provinceId);
  }

  @Delete()
  remove(@CurrentUser() user: AuthUser, @Body(new Unprocessable422Pipe(deleteAccountSchema)) body: DeleteAccountInput) {
    return this.profiles.deleteAccount(user, body);
  }
}
