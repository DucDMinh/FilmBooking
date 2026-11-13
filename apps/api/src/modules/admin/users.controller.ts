import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import { ERROR_CODES } from "@filmbooking/shared";
import {
  assignStaffSchema,
  cinemaIdParamSchema,
  listUsersQuerySchema,
  updateAssignmentSchema,
  updateUserAdminRoleSchema,
  updateUserLockSchema,
  userIdParamSchema,
  type AdminUserDto,
  type AssignStaffInput,
  type ListUsersQuery,
  type PagedDto,
  type StaffAssignmentDto,
  type StaffAssignmentRole,
  type UpdateAssignmentInput,
  type UpdateUserAdminRoleInput,
  type UpdateUserLockInput,
} from "@filmbooking/shared/schemas/admin";
import { AccessService, type AuthenticatedRequest } from "../../common/auth/access.service";
import { CinemaScope, CurrentUser, Roles, type AuthUser } from "../../common/auth/decorators";
import { AppException } from "../../common/errors/app-exception";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { SupabaseService } from "../../common/supabase/supabase.service";

interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  created_at: string;
}

interface StaffAssignmentRow {
  id: string;
  user_id: string;
  cinema_id: string;
  role: StaffAssignmentRole;
  created_at: string;
}

interface UserRoleRow {
  user_id: string;
  role: string;
}

@Controller()
export class UsersController {
  constructor(
    @Inject(SupabaseService) private readonly supabase: SupabaseService,
    @Inject(AccessService) private readonly access: AccessService,
  ) {}

  // ── Người dùng (Admin only) ────────────────────────────────────────────────

  @Roles("ADMIN")
  @Get("admin/users")
  async listUsers(@Query(new ZodValidationPipe(listUsersQuerySchema)) query: ListUsersQuery): Promise<PagedDto<AdminUserDto>> {
    const adminClient = this.supabase.admin();
    let builder = adminClient.from("profiles").select("id, email, full_name, phone, created_at", { count: "exact" });

    if (query.q) {
      builder = builder.or(`email.ilike.%${query.q}%,full_name.ilike.%${query.q}%,phone.ilike.%${query.q}%`);
    }

    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;

    const { data: profiles, count, error } = await builder.order("created_at", { ascending: false }).range(from, to);

    if (error) throw new AppException(ERROR_CODES.INTERNAL_ERROR, error.message);

    const profileRows = (profiles ?? []) as ProfileRow[];
    const items = await this.enrichAdminUsers(profileRows);

    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total: count ?? items.length,
    };
  }

  @Roles("ADMIN")
  @Get("admin/users/:userId")
  async getUser(@Param("userId", new ZodValidationPipe(userIdParamSchema)) userId: string): Promise<AdminUserDto> {
    const adminClient = this.supabase.admin();
    const { data: profile, error } = await adminClient
      .from("profiles")
      .select("id, email, full_name, phone, created_at")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw new AppException(ERROR_CODES.INTERNAL_ERROR, error.message);
    if (!profile) throw new AppException(ERROR_CODES.NOT_FOUND, "User not found");

    const enriched = await this.enrichAdminUsers([profile as ProfileRow]);
    const first = enriched[0];
    if (!first) throw new AppException(ERROR_CODES.NOT_FOUND, "User not found");

    return first;
  }

  @Roles("ADMIN")
  @Patch("admin/users/:userId/lock")
  async lockUser(
    @Param("userId", new ZodValidationPipe(userIdParamSchema)) userId: string,
    @Body(new ZodValidationPipe(updateUserLockSchema)) body: UpdateUserLockInput,
  ): Promise<{ success: boolean; locked: boolean }> {
    const adminClient = this.supabase.admin();
    const { data: profile } = await adminClient.from("profiles").select("id").eq("id", userId).maybeSingle();
    if (!profile) throw new AppException(ERROR_CODES.NOT_FOUND, "User not found");

    const banDuration = body.locked ? "876000h" : "none";
    const { error } = await adminClient.auth.admin.updateUserById(userId, {
      ban_duration: banDuration,
      app_metadata: { locked: body.locked },
    });

    if (error) throw new AppException(ERROR_CODES.INTERNAL_ERROR, error.message);

    return { success: true, locked: body.locked };
  }

  @Roles("ADMIN")
  @Patch("admin/users/:userId/admin-role")
  async setAdminRole(
    @Param("userId", new ZodValidationPipe(userIdParamSchema)) userId: string,
    @Body(new ZodValidationPipe(updateUserAdminRoleSchema)) body: UpdateUserAdminRoleInput,
  ): Promise<{ success: boolean; isAdmin: boolean }> {
    return this.applyAdminRole(userId, body.isAdmin);
  }

  @Roles("ADMIN")
  @Put("admin/users/:userId/roles/admin")
  async grantAdminRole(@Param("userId", new ZodValidationPipe(userIdParamSchema)) userId: string): Promise<{ success: boolean; isAdmin: boolean }> {
    return this.applyAdminRole(userId, true);
  }

  @Roles("ADMIN")
  @Delete("admin/users/:userId/roles/admin")
  async revokeAdminRole(@Param("userId", new ZodValidationPipe(userIdParamSchema)) userId: string): Promise<{ success: boolean; isAdmin: boolean }> {
    return this.applyAdminRole(userId, false);
  }

  // ── Gán nhân sự rạp (R-17, R-105, AC-16) ───────────────────────────────────

  @Roles("ADMIN", "MANAGER")
  @CinemaScope()
  @Get("admin/cinemas/:cinemaId/staff")
  async listCinemaStaff(
    @CurrentUser() user: AuthUser,
    @Param("cinemaId", new ZodValidationPipe(cinemaIdParamSchema)) cinemaId: string,
  ): Promise<StaffAssignmentDto[]> {
    const db = this.supabase.forUser(user.jwt);
    const { data: assignments, error } = await db
      .from("staff_assignments")
      .select("id, user_id, cinema_id, role, created_at")
      .eq("cinema_id", cinemaId)
      .order("created_at");

    if (error) throw new AppException(ERROR_CODES.INTERNAL_ERROR, error.message);

    const rows = (assignments ?? []) as StaffAssignmentRow[];
    return this.enrichStaffAssignments(rows);
  }

  @Roles("ADMIN", "MANAGER")
  @CinemaScope()
  @Post("admin/cinemas/:cinemaId/staff")
  @HttpCode(201)
  async assignStaff(
    @Req() req: AuthenticatedRequest,
    @Param("cinemaId", new ZodValidationPipe(cinemaIdParamSchema)) cinemaId: string,
    @Body(new ZodValidationPipe(assignStaffSchema)) body: AssignStaffInput,
  ): Promise<StaffAssignmentDto> {
    const access = await this.access.loadForRequest(req);

    // AC-16 / R-105: Manager chỉ được cấp vai trò STAFF cho rạp mình; cấp MANAGER/ADMIN -> 403
    if (!access.isAdmin && body.role !== "STAFF") {
      throw new AppException(ERROR_CODES.FORBIDDEN, "Manager can only assign STAFF role");
    }

    const targetUser = await this.resolveTargetUser(body);
    const db = this.supabase.forUser(req.user.jwt);

    const { data, error } = await db
      .from("staff_assignments")
      .insert({
        user_id: targetUser.id,
        cinema_id: cinemaId,
        role: body.role,
      })
      .select("id, user_id, cinema_id, role, created_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new AppException(ERROR_CODES.CONFLICT, "User is already assigned to this cinema");
      }
      throw new AppException(ERROR_CODES.INTERNAL_ERROR, error.message);
    }

    const row = data as StaffAssignmentRow;
    return {
      userId: row.user_id,
      cinemaId: row.cinema_id,
      role: row.role,
      email: targetUser.email,
      fullName: targetUser.full_name,
      createdAt: row.created_at,
    };
  }

  @Roles("ADMIN")
  @Patch("admin/cinemas/:cinemaId/staff/:userId")
  async updateStaffRole(
    @CurrentUser() user: AuthUser,
    @Param("cinemaId", new ZodValidationPipe(cinemaIdParamSchema)) cinemaId: string,
    @Param("userId", new ZodValidationPipe(userIdParamSchema)) userId: string,
    @Body(new ZodValidationPipe(updateAssignmentSchema)) body: UpdateAssignmentInput,
  ): Promise<StaffAssignmentDto> {
    const db = this.supabase.forUser(user.jwt);
    const { data, error } = await db
      .from("staff_assignments")
      .update({ role: body.role })
      .eq("cinema_id", cinemaId)
      .eq("user_id", userId)
      .select("id, user_id, cinema_id, role, created_at")
      .maybeSingle();

    if (error) throw new AppException(ERROR_CODES.INTERNAL_ERROR, error.message);
    if (!data) throw new AppException(ERROR_CODES.NOT_FOUND, "Staff assignment not found");

    const enriched = await this.enrichStaffAssignments([data as StaffAssignmentRow]);
    const first = enriched[0];
    if (!first) throw new AppException(ERROR_CODES.NOT_FOUND, "Staff assignment not found");

    return first;
  }

  @Roles("ADMIN", "MANAGER")
  @CinemaScope()
  @Delete("admin/cinemas/:cinemaId/staff/:userId")
  async removeStaff(
    @Req() req: AuthenticatedRequest,
    @Param("cinemaId", new ZodValidationPipe(cinemaIdParamSchema)) cinemaId: string,
    @Param("userId", new ZodValidationPipe(userIdParamSchema)) userId: string,
  ): Promise<{ success: boolean }> {
    const access = await this.access.loadForRequest(req);
    const db = this.supabase.forUser(req.user.jwt);

    // Manager chỉ được xoá STAFF khỏi rạp mình, không được xoá MANAGER
    if (!access.isAdmin) {
      const { data: existing } = await db
        .from("staff_assignments")
        .select("role")
        .eq("cinema_id", cinemaId)
        .eq("user_id", userId)
        .maybeSingle();

      if (!existing) throw new AppException(ERROR_CODES.NOT_FOUND, "Staff assignment not found");
      if (existing.role !== "STAFF") {
        throw new AppException(ERROR_CODES.FORBIDDEN, "Manager can only remove STAFF");
      }
    }

    const { data, error } = await db
      .from("staff_assignments")
      .delete()
      .eq("cinema_id", cinemaId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();

    if (error) throw new AppException(ERROR_CODES.INTERNAL_ERROR, error.message);
    if (!data) throw new AppException(ERROR_CODES.NOT_FOUND, "Staff assignment not found");

    return { success: true };
  }

  // ── Helper methods ────────────────────────────────────────────────────────

  private async applyAdminRole(userId: string, isAdmin: boolean): Promise<{ success: boolean; isAdmin: boolean }> {
    const adminClient = this.supabase.admin();
    const { data: profile } = await adminClient.from("profiles").select("id").eq("id", userId).maybeSingle();
    if (!profile) throw new AppException(ERROR_CODES.NOT_FOUND, "User not found");

    if (isAdmin) {
      const { error } = await adminClient
        .from("user_roles")
        .insert({ user_id: userId, role: "ADMIN" as never });
      if (error && error.code !== "23505") throw new AppException(ERROR_CODES.INTERNAL_ERROR, error.message);
    } else {
      const { error } = await adminClient
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", "ADMIN");
      if (error) throw new AppException(ERROR_CODES.INTERNAL_ERROR, error.message);
    }

    return { success: true, isAdmin };
  }

  private async resolveTargetUser(body: AssignStaffInput): Promise<ProfileRow> {
    const adminClient = this.supabase.admin();
    let query = adminClient.from("profiles").select("id, email, full_name, phone, created_at");

    if (body.userId) {
      query = query.eq("id", body.userId);
    } else if (body.email) {
      query = query.eq("email", body.email.toLowerCase());
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw new AppException(ERROR_CODES.INTERNAL_ERROR, error.message);
    if (!data) throw new AppException(ERROR_CODES.NOT_FOUND, "User not found");

    return data as ProfileRow;
  }

  private async enrichStaffAssignments(assignments: StaffAssignmentRow[]): Promise<StaffAssignmentDto[]> {
    if (assignments.length === 0) return [];
    const userIds = assignments.map((a) => a.user_id);
    const adminClient = this.supabase.admin();
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("id, email, full_name")
      .in("id", userIds);

    const profileMap = new Map(((profiles ?? []) as ProfileRow[]).map((p) => [p.id, p]));

    return assignments.map((a) => {
      const prof = profileMap.get(a.user_id);
      return {
        userId: a.user_id,
        cinemaId: a.cinema_id,
        role: a.role,
        email: prof?.email ?? null,
        fullName: prof?.full_name ?? null,
        createdAt: a.created_at,
      };
    });
  }

  private async enrichAdminUsers(profiles: ProfileRow[]): Promise<AdminUserDto[]> {
    if (profiles.length === 0) return [];
    const userIds = profiles.map((p) => p.id);
    const adminClient = this.supabase.admin();

    const [rolesRes, assignmentsRes] = await Promise.all([
      adminClient.from("user_roles").select("user_id, role").in("user_id", userIds),
      adminClient.from("staff_assignments").select("user_id, cinema_id, role").in("user_id", userIds),
    ]);

    const adminUserIds = new Set(
      ((rolesRes.data ?? []) as UserRoleRow[])
        .filter((r) => r.role === "ADMIN")
        .map((r) => r.user_id),
    );

    const assignmentsMap = new Map<string, { cinemaId: string; role: StaffAssignmentRole }[]>();
    for (const a of (assignmentsRes.data ?? []) as StaffAssignmentRow[]) {
      const list = assignmentsMap.get(a.user_id) ?? [];
      list.push({ cinemaId: a.cinema_id, role: a.role });
      assignmentsMap.set(a.user_id, list);
    }

    return Promise.all(
      profiles.map(async (p) => {
        const locked = await this.checkUserLocked(adminClient, p.id);
        return {
          id: p.id,
          email: p.email,
          fullName: p.full_name,
          phone: p.phone,
          createdAt: p.created_at,
          isAdmin: adminUserIds.has(p.id),
          locked,
          assignments: assignmentsMap.get(p.id) ?? [],
        };
      }),
    );
  }

  private async checkUserLocked(adminClient: ReturnType<SupabaseService["admin"]>, userId: string): Promise<boolean> {
    try {
      const authUser = await adminClient.auth.admin.getUserById(userId);
      const raw = authUser.data?.user;
      const bannedUntil = (raw as { banned_until?: string | null })?.banned_until;
      const appMetaLocked = (raw?.app_metadata as { locked?: boolean })?.locked;
      return Boolean(appMetaLocked || (bannedUntil && new Date(bannedUntil) > new Date()));
    } catch {
      return false;
    }
  }
}
