import { Controller, HttpCode, HttpStatus, Inject, Injectable, Logger, Optional, Post, Query, UseGuards } from "@nestjs/common";
import { Public } from "../../common/auth/decorators";
import { JobSecretGuard } from "../../common/auth/job-secret.guard";
import { reportAlert } from "../../common/monitoring/sentry";
import { SupabaseService } from "../../common/supabase/supabase.service";
import { ENV, type Env } from "../../config/env";
import { MailService } from "../mail/mail.service";
import { ReconcileService, type ReconcileJobResult } from "./reconcile.service";

export interface SendEmailsJobResult {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
}

export const MAX_EMAIL_ATTEMPTS = 3;

/** Vé của đơn đưa vào payload mail: mỗi ghế một vé với qr_token riêng. */
interface TicketForEmail {
  seat_label?: string;
  qr_token: string;
}

interface TicketRowWithSeat {
  qr_token?: string | null;
  /** PostgREST embed của FK order_seat_id: object (to-one), phòng trường hợp trả mảng. */
  order_seats?: { seat_label?: string | null } | { seat_label?: string | null }[] | null;
}

/**
 * Chuẩn hoá vé của đơn: bỏ dòng thiếu token, xếp theo nhãn ghế kiểu tự nhiên (A2 trước A10), vé không có nhãn xếp cuối.
 * Không nhúng token vào log.
 */
export function orderTicketsForEmail(rows: TicketRowWithSeat[]): TicketForEmail[] {
  const tickets: TicketForEmail[] = [];
  for (const row of rows) {
    if (!row.qr_token) continue;
    const seat = Array.isArray(row.order_seats) ? row.order_seats[0] : row.order_seats;
    tickets.push(seat?.seat_label ? { seat_label: seat.seat_label, qr_token: row.qr_token } : { qr_token: row.qr_token });
  }
  return tickets.sort((a, b) => {
    if (a.seat_label && b.seat_label) return a.seat_label.localeCompare(b.seat_label, "vi", { numeric: true });
    if (a.seat_label) return -1;
    if (b.seat_label) return 1;
    return 0;
  });
}

interface OutboxCandidate {
  id: string;
  kind: string;
  to_email: string;
  payload: Record<string, unknown>;
  cinema_id?: string | null;
  attempts: number;
  next_attempt_at: string;
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  /** Khóa in-process chống trùng lặp cục bộ giữa các luồng đồng thời trong cùng process */
  private readonly inFlightIds = new Set<string>();

  constructor(
    @Inject(SupabaseService) private readonly supabase: SupabaseService,
    @Inject(MailService) private readonly mailService: MailService,
    @Optional() @Inject(ENV) private readonly env?: Env,
  ) {}

  /**
   * B/M5: Tự động truy vấn bổ sung vé (mỗi ghế một qr_token), cinema_address, và seats
   * nếu payload vé từ DB thiếu các trường này trước khi render email gửi cho khách.
   */
  private async enrichTicketPayload(
    payload: Record<string, unknown>,
    fallbackCinemaId?: string | null,
  ): Promise<Record<string, unknown>> {
    const enriched = { ...payload };
    const orderId = (enriched.order_id ?? enriched.orderId) as string | undefined;
    const cinemaId = (enriched.cinema_id ?? enriched.cinemaId ?? fallbackCinemaId) as string | undefined;
    const admin = this.supabase.admin();

    const hasQr =
      Boolean(enriched.qr_token ?? enriched.qrToken) || (Array.isArray(enriched.tickets) && enriched.tickets.length > 0);
    const hasAddress = Boolean(enriched.cinema_address ?? enriched.cinemaAddress);
    const hasSeats = Array.isArray(enriched.seats)
      ? enriched.seats.length > 0
      : Boolean(enriched.seats);

    const tasks: Promise<void>[] = [];

    if (!hasQr && orderId) {
      tasks.push(
        (async () => {
          try {
            // Mỗi ghế một vé: lấy TẤT CẢ vé của đơn (không limit) kèm nhãn ghế để email có đủ QR từng ghế.
            const { data, error } = await admin
              .from("tickets")
              .select("qr_token, order_seats(seat_label)")
              .eq("order_id", orderId);
            if (error) {
              // PostgREST trả error (không throw): mail vẫn gửi nhưng thiếu QR → để lại dấu vết (chỉ order id + code).
              this.logger.warn(`Failed to enrich tickets for order ${orderId}: ${error.code ?? "unknown"}`);
            } else if (Array.isArray(data)) {
              const tickets = orderTicketsForEmail(data as TicketRowWithSeat[]);
              if (tickets.length > 0) enriched.tickets = tickets;
            }
          } catch (err) {
            // Chỉ log order id + lỗi; err không chứa qr_token.
            this.logger.warn(`Failed to enrich tickets for order ${orderId}: ${err}`);
          }
        })(),
      );
    }

    if (!hasAddress && cinemaId) {
      tasks.push(
        (async () => {
          try {
            const { data, error } = await admin
              .from("cinemas")
              .select("address")
              .eq("id", cinemaId)
              .maybeSingle();
            if (!error && data?.address) {
              enriched.cinema_address = data.address;
            }
          } catch (err) {
            this.logger.warn(`Failed to enrich cinema_address for cinema ${cinemaId}: ${err}`);
          }
        })(),
      );
    }

    if (!hasSeats && orderId) {
      tasks.push(
        (async () => {
          try {
            const { data, error } = await admin
              .from("order_seats")
              .select("seat_label")
              .eq("order_id", orderId);
            if (!error && Array.isArray(data) && data.length > 0) {
              enriched.seats = data.map((s: { seat_label: string }) => s.seat_label);
            }
          } catch (err) {
            this.logger.warn(`Failed to enrich seats for order ${orderId}: ${err}`);
          }
        })(),
      );
    }

    if (tasks.length > 0) {
      await Promise.all(tasks);
    }

    return enriched;
  }

  /**
   * Lấy batch PENDING từ email_outbox (SKIP LOCKED concurrency via RPC hoặc atomic claim),
   * gửi email qua SMTP, cập nhật trạng thái SENT hoặc FAILED kèm retry backoff và last_error.
   */
  async processEmailOutbox(batchSize: number = 20): Promise<SendEmailsJobResult> {
    const admin = this.supabase.admin();
    const now = new Date().toISOString();

    // 1. Thử gọi RPC claim_email_outbox_batch nếu có
    const rpcResult = await admin.rpc("claim_email_outbox_batch", {
      p_batch_size: batchSize,
    });

    let candidates: OutboxCandidate[];

    if (!rpcResult.error && Array.isArray(rpcResult.data)) {
      candidates = rpcResult.data as OutboxCandidate[];
    } else {
      // 2. Fallback: Lấy batch PENDING có next_attempt_at <= now
      const { data, error } = await admin
        .from("email_outbox")
        .select("id, kind, to_email, payload, attempts, next_attempt_at, cinema_id")
        .eq("status", "PENDING")
        .lte("next_attempt_at", now)
        .order("next_attempt_at", { ascending: true })
        .limit(batchSize);

      if (error) {
        this.logger.error(`Failed to fetch pending emails: ${error.message}`);
        throw error;
      }

      candidates = (data ?? []) as unknown as OutboxCandidate[];
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const item of candidates) {
      // Kiểm tra in-flight lock trong process
      if (this.inFlightIds.has(item.id)) {
        skipped++;
        continue;
      }

      // Atomic lock / claim: nếu chưa dùng RPC khoá, dời next_attempt_at và kiểm tra điều kiện PENDING
      this.inFlightIds.add(item.id);
      try {
        const lockExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        const { data: claimed, error: claimErr } = await admin
          .from("email_outbox")
          .update({
            next_attempt_at: lockExpiry,
          })
          .eq("id", item.id)
          .eq("status", "PENDING")
          .lte("next_attempt_at", now)
          .select("id, kind, to_email, payload, attempts, cinema_id");

        if (claimErr || !claimed || claimed.length === 0) {
          // Bị worker khác claim trước (SKIP LOCKED)
          skipped++;
          continue;
        }

        const currentAttempts = item.attempts ?? 0;

        try {
          let payload = (item.payload ?? {}) as Record<string, unknown>;
          if (this.env?.WEB_ORIGIN?.[0] && !payload.web_origin && !payload.webOrigin) {
            payload.web_origin = this.env.WEB_ORIGIN[0];
          }

          const normalizedKind = item.kind ? item.kind.toUpperCase().trim() : "";
          if (normalizedKind === "TICKET_ISSUED" || normalizedKind === "TICKET") {
            payload = await this.enrichTicketPayload(payload, item.cinema_id);
          }

          await this.mailService.sendOutboxEmail(
            item.to_email,
            item.kind,
            payload,
          );

          // Cập nhật SENT thành công
          const { error: sentErr } = await admin
            .from("email_outbox")
            .update({
              status: "SENT",
              sent_at: new Date().toISOString(),
              attempts: currentAttempts + 1,
              last_error: null,
            })
            .eq("id", item.id);

          if (sentErr) {
            this.logger.error(`Failed to update outbox id=${item.id} to SENT: ${sentErr.message}`);
          }

          sent++;
        } catch (sendErr) {
          const errorMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
          const nextAttempts = currentAttempts + 1;
          const isUnknownKind = errorMsg.includes("UNKNOWN_KIND");
          const isFinalFailure = nextAttempts >= MAX_EMAIL_ATTEMPTS || isUnknownKind;

          // Exponential backoff: 2^attempts phút (1 -> 2m, 2 -> 4m)
          const backoffMinutes = Math.pow(2, nextAttempts);
          const nextAttemptAt = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();

          const { error: failErr } = await admin
            .from("email_outbox")
            .update({
              status: isFinalFailure ? "FAILED" : "PENDING",
              attempts: isUnknownKind ? MAX_EMAIL_ATTEMPTS : nextAttempts,
              next_attempt_at: isFinalFailure ? item.next_attempt_at : nextAttemptAt,
              last_error: errorMsg,
            })
            .eq("id", item.id);

          if (failErr) {
            this.logger.error(`Failed to update outbox id=${item.id} error state: ${failErr.message}`);
          }

          if (isFinalFailure) {
            failed++;
            // Không đưa email người nhận / last_error vào event (PII); chỉ kind + id outbox.
            reportAlert({
              alert: "email_failed",
              message: "Email outbox chuyển FAILED",
              cinemaId: item.cinema_id,
              extra: { outboxId: item.id, kind: item.kind, attempts: nextAttempts },
            });
          }
          this.logger.warn(
            `Email outbox id=${item.id} attempt=${nextAttempts}/${MAX_EMAIL_ATTEMPTS} failed: ${errorMsg}`,
          );
        }
      } finally {
        this.inFlightIds.delete(item.id);
      }
    }

    return {
      processed: candidates.length,
      sent,
      failed,
      skipped,
    };
  }
}

@Controller("jobs")
@Public()
@UseGuards(JobSecretGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post("send-emails")
  @HttpCode(HttpStatus.OK)
  async sendEmails(
    @Query("batchSize") batchSize?: string,
  ): Promise<SendEmailsJobResult> {
    const rawLimit = batchSize ? Number.parseInt(batchSize, 10) : 20;
    const limit = Number.isNaN(rawLimit) ? 20 : Math.max(1, Math.min(100, rawLimit));
    return this.jobsService.processEmailOutbox(limit);
  }
}

/** Controller riêng để JobsController (email outbox) không phụ thuộc module thanh toán. */
@Controller("jobs")
@Public()
@UseGuards(JobSecretGuard)
export class ReconcileController {
  constructor(@Inject(ReconcileService) private readonly reconcileService: ReconcileService) {}

  /** Đối soát PayOS (R-78): pg_cron gọi mỗi 5 phút. */
  @Post("reconcile")
  @HttpCode(HttpStatus.OK)
  async reconcile(): Promise<ReconcileJobResult> {
    return this.reconcileService.reconcilePendingPayments();
  }
}
