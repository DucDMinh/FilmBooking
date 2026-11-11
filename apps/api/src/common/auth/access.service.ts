import { Inject, Injectable } from "@nestjs/common";
import { SupabaseService } from "../supabase/supabase.service";
import type { AuthUser, RequiredRole, StaffRole } from "./decorators";

export interface UserAccess {
  isAdmin: boolean;
  /** cinemaId -> vai trò tại rạp đó. */
  cinemaRoles: ReadonlyMap<string, StaffRole>;
}

/** Request đã qua AuthGuard. Dùng làm khoá cache để mỗi request chỉ truy vấn DB một lần. */
export interface AuthenticatedRequest {
  user: AuthUser;
}

/** Vai trò `held` có thoả yêu cầu `required` không (MANAGER bao gồm STAFF). */
export function satisfies(held: StaffRole, required: RequiredRole): boolean {
  return held === required || (held === "MANAGER" && required === "STAFF");
}

/** Đọc user_roles + staff_assignments + trạng thái email bằng service role (guard quyết định quyền, không phải RLS). */
@Injectable()
export class AccessService {
  private readonly accessByRequest = new WeakMap<object, Promise<UserAccess>>();
  private readonly emailByRequest = new WeakMap<object, Promise<boolean>>();

  constructor(@Inject(SupabaseService) private readonly supabase: SupabaseService) {}

  /** Vai trò của user, nhớ theo request: RolesGuard + CinemaScopeGuard chỉ tốn một lượt truy vấn. */
  loadForRequest(request: AuthenticatedRequest): Promise<UserAccess> {
    let pending = this.accessByRequest.get(request);
    if (!pending) {
      pending = this.load(request.user.id);
      this.accessByRequest.set(request, pending);
    }
    return pending;
  }

  /**
   * Email đã xác nhận chưa — nguồn tin cậy là `auth.users.email_confirmed_at` (qua admin API).
   * KHÔNG dùng claim `user_metadata.email_verified` trong JWT vì user tự sửa được.
   * Lazy + nhớ theo request; handler cần (vd đặt vé) tự gọi.
   */
  isEmailConfirmed(request: AuthenticatedRequest): Promise<boolean> {
    let pending = this.emailByRequest.get(request);
    if (!pending) {
      pending = this.fetchEmailConfirmed(request.user.id);
      this.emailByRequest.set(request, pending);
    }
    return pending;
  }

  private async fetchEmailConfirmed(userId: string): Promise<boolean> {
    const { data, error } = await this.supabase.admin().auth.admin.getUserById(userId);
    if (error) throw error;
    return Boolean(data.user?.email_confirmed_at);
  }

  private async load(userId: string): Promise<UserAccess> {
    const db = this.supabase.admin();
    const [roles, assignments] = await Promise.all([
      db.from("user_roles").select("role").eq("user_id", userId),
      db.from("staff_assignments").select("cinema_id, role").eq("user_id", userId),
    ]);
    if (roles.error) throw roles.error;
    if (assignments.error) throw assignments.error;
    return {
      isAdmin: (roles.data ?? []).some((row) => row.role === "ADMIN"),
      cinemaRoles: new Map(
        (assignments.data ?? []).map((row) => [row.cinema_id as string, row.role as StaffRole]),
      ),
    };
  }
}
