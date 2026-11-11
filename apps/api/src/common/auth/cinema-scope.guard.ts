import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ERROR_CODES } from "@filmbooking/shared";
import { AppException } from "../errors/app-exception";
import { AccessService, satisfies, type AuthenticatedRequest } from "./access.service";
import {
  CINEMA_SCOPE_KEY,
  ROLES_KEY,
  type AuthUser,
  type CinemaScopeOptions,
  type RequiredRole,
} from "./decorators";

interface ScopedRequest {
  user?: AuthUser;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

/** Giá trị không phải string (mảng/object do query parser) không bao giờ khớp rạp nào -> bị từ chối. */
const INVALID_CINEMA_ID = "\u0000invalid";

/**
 * Fail-closed: handler gắn `@CinemaScope()` mà không xác định được cinemaId thì Staff/Manager bị chặn.
 * Mọi cinemaId xuất hiện (params/query/body/resolve) đều phải nằm trong rạp được gán,
 * và nếu có `@Roles` thì vai trò TẠI RẠP ĐÓ phải thoả yêu cầu.
 */
@Injectable()
export class CinemaScopeGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AccessService) private readonly access: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const options = this.reflector.getAllAndOverride<CinemaScopeOptions | undefined>(CINEMA_SCOPE_KEY, targets);
    if (!options) return true;
    const request = context.switchToHttp().getRequest<ScopedRequest>();
    if (!request.user) throw new AppException(ERROR_CODES.UNAUTHENTICATED, "Authentication required");

    // Cùng object request với RolesGuard -> dùng lại kết quả đã tải.
    const access = await this.access.loadForRequest(request as AuthenticatedRequest);
    if (access.isAdmin) return true;

    const cinemaIds = await this.collectCinemaIds(request, options);
    const required = this.reflector.getAllAndOverride<RequiredRole[] | undefined>(ROLES_KEY, targets);
    const permitted =
      cinemaIds.length > 0 &&
      cinemaIds.every((id) => {
        const held = access.cinemaRoles.get(id);
        return held !== undefined && (!required?.length || required.some((role) => satisfies(held, role)));
      });
    if (!permitted) throw new AppException(ERROR_CODES.FORBIDDEN_CINEMA, "No access to this cinema");
    return true;
  }

  private async collectCinemaIds(request: ScopedRequest, options: CinemaScopeOptions): Promise<string[]> {
    const key = options.key ?? "cinemaId";
    const found: unknown[] = [request.params?.[key], request.query?.[key], request.body?.[key]];
    if (options.resolve) found.push(await options.resolve(request as Record<string, unknown>));
    return found
      .filter((value) => value !== undefined)
      .map((value) => (typeof value === "string" ? value : INVALID_CINEMA_ID));
  }
}
