import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ERROR_CODES } from "@filmbooking/shared";
import { AppException } from "../errors/app-exception";
import { AccessService, satisfies, type AuthenticatedRequest } from "./access.service";
import { ROLES_KEY, type AuthUser, type RequiredRole } from "./decorators";

/** Không có `@Roles` -> cho qua. Có -> Admin, hoặc được gán vai trò phù hợp ở ít nhất một rạp. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AccessService) private readonly access: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!request.user) throw new AppException(ERROR_CODES.UNAUTHENTICATED, "Authentication required");

    // Truyền chính object request (khoá WeakMap) để RolesGuard và CinemaScopeGuard dùng chung một lượt tải.
    const access = await this.access.loadForRequest(request as AuthenticatedRequest);
    if (access.isAdmin) return true;
    const allowed = [...access.cinemaRoles.values()].some((held) =>
      required.some((role) => satisfies(held, role)),
    );
    if (!allowed) throw new AppException(ERROR_CODES.FORBIDDEN, "Insufficient role");
    return true;
  }
}
