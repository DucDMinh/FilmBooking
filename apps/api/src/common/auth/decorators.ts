import { SetMetadata, createParamDecorator, type ExecutionContext } from "@nestjs/common";

export type StaffRole = "STAFF" | "MANAGER";
export type RequiredRole = "ADMIN" | StaffRole;

/**
 * Danh tính từ JWT. KHÔNG có cờ `emailConfirmed`: claim `user_metadata` do user tự sửa được, nên
 * trạng thái xác nhận email chỉ lấy từ DB qua `AccessService.isEmailConfirmed(request)`.
 */
export interface AuthUser {
  id: string;
  email: string | null;
  /** JWT thô của user. TUYỆT ĐỐI không log/serialize cả `req.user`. */
  jwt: string;
}

export interface CinemaScopeOptions {
  /** Tên key đọc cinemaId trong params/query/body. Mặc định "cinemaId". */
  key?: string;
  /** Tra cinemaId từ entity (vd showtime -> cinema) khi request không mang cinemaId trực tiếp. */
  resolve?: (request: Record<string, unknown>) => Promise<string | undefined> | string | undefined;
}

export const IS_PUBLIC_KEY = "auth:isPublic";
export const ROLES_KEY = "auth:roles";
export const CINEMA_SCOPE_KEY = "auth:cinemaScope";

/** Bỏ qua AuthGuard cho handler/controller này. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
/** Yêu cầu ít nhất MỘT trong các vai trò. ADMIN luôn qua; MANAGER thoả yêu cầu STAFF. */
export const Roles = (...roles: RequiredRole[]) => SetMetadata(ROLES_KEY, roles);
/** Bắt buộc user được gán rạp mà request nhắm tới (Admin qua mọi rạp). */
export const CinemaScope = (options: CinemaScopeOptions = {}) => SetMetadata(CINEMA_SCOPE_KEY, options);

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => {
  return context.switchToHttp().getRequest<{ user: AuthUser }>().user;
});
