import { Controller, Get, Inject, Req } from "@nestjs/common";
import type { MeResponse } from "@filmbooking/shared/schemas/me";
import { AccessService, type AuthenticatedRequest } from "../../common/auth/access.service";

@Controller("me")
export class MeController {
  constructor(@Inject(AccessService) private readonly access: AccessService) {}

  /** Hồ sơ + vai trò + rạp được gán. Không log `request.user` (chứa JWT thô). */
  @Get()
  async me(@Req() request: AuthenticatedRequest): Promise<MeResponse> {
    const [access, emailConfirmed] = await Promise.all([
      this.access.loadForRequest(request),
      this.access.isEmailConfirmed(request),
    ]);
    return {
      id: request.user.id,
      email: request.user.email,
      emailConfirmed,
      isAdmin: access.isAdmin,
      cinemas: [...access.cinemaRoles].map(([cinemaId, role]) => ({ cinemaId, role })),
    };
  }
}
