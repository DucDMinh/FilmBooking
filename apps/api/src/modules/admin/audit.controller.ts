import { Controller, Get, Inject, Query, Req } from "@nestjs/common";
import { ERROR_CODES } from "@filmbooking/shared";
import {
  listAuditLogsQuerySchema,
  type AuditLogDto,
  type ListAuditLogsQuery,
  type PagedDto,
} from "@filmbooking/shared/schemas/admin";
import { AccessService, type AuthenticatedRequest } from "../../common/auth/access.service";
import { Roles } from "../../common/auth/decorators";
import { AppException } from "../../common/errors/app-exception";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { SupabaseService } from "../../common/supabase/supabase.service";

interface AuditLogRow {
  id: number;
  occurred_at: string;
  actor_id: string | null;
  cinema_id: string | null;
  table_name: string;
  record_id: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  before_data: unknown;
  after_data: unknown;
}

const AUDIT_COLUMNS = "id, occurred_at, actor_id, cinema_id, table_name, record_id, action, before_data, after_data";

@Controller()
export class AuditController {
  constructor(
    @Inject(SupabaseService) private readonly supabase: SupabaseService,
    @Inject(AccessService) private readonly access: AccessService,
  ) {}

  @Roles("ADMIN", "MANAGER")
  @Get("admin/audit-logs")
  async listLogs(
    @Req() req: AuthenticatedRequest,
    @Query(new ZodValidationPipe(listAuditLogsQuerySchema)) query: ListAuditLogsQuery,
  ): Promise<PagedDto<AuditLogDto>> {
    return this.queryAudit(req, query);
  }

  @Roles("ADMIN", "MANAGER")
  @Get("admin/audit")
  async listAudit(
    @Req() req: AuthenticatedRequest,
    @Query(new ZodValidationPipe(listAuditLogsQuerySchema)) query: ListAuditLogsQuery,
  ): Promise<PagedDto<AuditLogDto>> {
    return this.queryAudit(req, query);
  }

  private async queryAudit(req: AuthenticatedRequest, query: ListAuditLogsQuery): Promise<PagedDto<AuditLogDto>> {
    const access = await this.access.loadForRequest(req);
    const db = this.supabase.forUser(req.user.jwt);

    let builder = db.from("audit_logs").select(AUDIT_COLUMNS, { count: "exact" });

    // Phạm vi rạp: Manager chỉ xem rạp mình; Admin xem toàn chuỗi hoặc lọc rạp
    if (!access.isAdmin) {
      const allowedCinemas = Array.from(access.cinemaRoles.keys());
      if (allowedCinemas.length === 0) {
        return { items: [], page: query.page, pageSize: query.pageSize, total: 0 };
      }
      if (query.cinemaId) {
        if (!access.cinemaRoles.has(query.cinemaId)) {
          throw new AppException(ERROR_CODES.FORBIDDEN_CINEMA, "No access to this cinema");
        }
        builder = builder.eq("cinema_id", query.cinemaId);
      } else {
        builder = builder.in("cinema_id", allowedCinemas);
      }
    } else if (query.cinemaId) {
      builder = builder.eq("cinema_id", query.cinemaId);
    }

    if (query.actorId) builder = builder.eq("actor_id", query.actorId);
    if (query.tableName) builder = builder.eq("table_name", query.tableName);
    if (query.action) builder = builder.eq("action", query.action);
    if (query.from) builder = builder.gte("occurred_at", query.from);
    if (query.to) builder = builder.lte("occurred_at", query.to);

    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;

    const { data, count, error } = await builder.order("occurred_at", { ascending: false }).range(from, to);

    if (error) throw new AppException(ERROR_CODES.INTERNAL_ERROR, error.message);

    const items = ((data ?? []) as AuditLogRow[]).map(toAuditDto);
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total: count ?? items.length,
    };
  }
}

function toAuditDto(row: AuditLogRow): AuditLogDto {
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    actorId: row.actor_id,
    cinemaId: row.cinema_id,
    tableName: row.table_name,
    recordId: row.record_id,
    action: row.action,
    beforeData: row.before_data,
    afterData: row.after_data,
  };
}
