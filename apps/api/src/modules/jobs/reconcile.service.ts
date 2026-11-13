import { Inject, Injectable, Logger } from "@nestjs/common";
import { PAYOS_SUCCESS_CODE } from "@filmbooking/shared/schemas/payment";
import { PayOS } from "@payos/node";
import { SupabaseService } from "../../common/supabase/supabase.service";
import { ENV, type Env } from "../../config/env";
import { PaymentService } from "../payment/payment.service";

export interface PayosPaymentInfo {
  status: string;
  amountPaid: number;
  reference?: string;
  transactionDateTime?: string;
}

export interface ReconcileJobResult {
  checked: number;
  /** confirm_paid chốt đơn mới (SUCCESS) */
  paid: number;
  /** đơn đã paid từ trước (webhook tới đủ) */
  alreadyPaid: number;
  /** tiền về nhưng cần người xử lý (needs_manual_review / AMOUNT_MISMATCH / không tìm thấy đơn) */
  needsReview: number;
  cancelled: number;
  expired: number;
  skipped: number;
  errors: number;
}

/** Ngưỡng chờ webhook tới trước khi đối soát; PENDING quá 24h thôi không hỏi PayOS nữa. */
const WEBHOOK_GRACE_MS = 2 * 60 * 1000;
const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const PENDING_BATCH_LIMIT = 50;
/** EXPIRED (đơn bỏ dở) chỉ còn khả năng tiền về muộn: kiểm trong cửa sổ ngắn, batch nhỏ, không chiếm chỗ PENDING. */
const EXPIRED_WINDOW_MS = 60 * 60 * 1000;
const EXPIRED_BATCH_LIMIT = 20;

/** Truy vấn trạng thái link thanh toán trên PayOS (R-78). Tách riêng để test mock được. */
@Injectable()
export class PayosPaymentLookup {
  private readonly logger = new Logger(PayosPaymentLookup.name);
  private readonly payOS?: PayOS;

  constructor(@Inject(ENV) env: Env) {
    if (env.PAYOS_CLIENT_ID && env.PAYOS_API_KEY && env.PAYOS_CHECKSUM_KEY) {
      this.payOS = new PayOS({
        clientId: env.PAYOS_CLIENT_ID,
        apiKey: env.PAYOS_API_KEY,
        checksumKey: env.PAYOS_CHECKSUM_KEY,
      });
    }
  }

  /** null = chưa cấu hình PayOS (dev/test) -> bỏ qua đối soát. */
  async getPayment(orderCode: number): Promise<PayosPaymentInfo | null> {
    if (!this.payOS) {
      this.logger.warn("PayOS credentials not configured, reconcile skipped");
      return null;
    }
    const link = await this.payOS.paymentRequests.get(orderCode);
    const tx = link.transactions?.[0];
    return {
      status: link.status,
      amountPaid: link.amountPaid,
      reference: tx?.reference,
      transactionDateTime: tx?.transactionDateTime,
    };
  }
}

interface CandidatePayment {
  id: string;
  order_id: string;
  order_code: number;
  amount: number;
  status: string;
}

/**
 * Đối soát PayOS (R-78, R-80, AC-11): với payment PENDING (webhook có thể lỡ) hoặc EXPIRED gần đây
 * (tiền về muộn), hỏi PayOS rồi đi lại đúng các đường đã có: handleWebhook -> confirm_paid
 * (idempotent, tiền về muộn/manual review nằm trong RPC) hoặc mark_payment_cancelled (nhả ghế).
 */
@Injectable()
export class ReconcileService {
  private readonly logger = new Logger(ReconcileService.name);

  constructor(
    @Inject(SupabaseService) private readonly supabase: SupabaseService,
    @Inject(PaymentService) private readonly paymentService: PaymentService,
    @Inject(PayosPaymentLookup) private readonly lookup: PayosPaymentLookup,
  ) {}

  async reconcilePendingPayments(): Promise<ReconcileJobResult> {
    const result: ReconcileJobResult = {
      checked: 0, paid: 0, alreadyPaid: 0, needsReview: 0, cancelled: 0, expired: 0, skipped: 0, errors: 0,
    };
    const now = Date.now();
    const graceCutoff = new Date(now - WEBHOOK_GRACE_MS).toISOString();
    // PENDING trước: đây là mục tiêu chính (webhook lỡ), không bao giờ bị EXPIRED lấn batch.
    const pending = await this.loadCandidates("PENDING", graceCutoff, now - LOOKBACK_MS, PENDING_BATCH_LIMIT);
    const expired = await this.loadCandidates("EXPIRED", graceCutoff, now - EXPIRED_WINDOW_MS, EXPIRED_BATCH_LIMIT);

    for (const payment of [...pending, ...expired]) {
      result.checked++;
      try {
        await this.reconcileOne(payment, result);
      } catch (err) {
        result.errors++;
        this.logger.error(
          `Reconcile failed for orderCode=${payment.order_code}: ${(err as Error).message}`,
        );
      }
    }
    return result;
  }

  private async loadCandidates(
    status: "PENDING" | "EXPIRED",
    createdBefore: string,
    createdAfterMs: number,
    limit: number,
  ): Promise<CandidatePayment[]> {
    const { data, error } = await this.supabase
      .admin()
      .from("payments")
      .select("id, order_id, order_code, amount, status")
      .eq("status", status)
      .lte("created_at", createdBefore)
      .gte("created_at", new Date(createdAfterMs).toISOString())
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) {
      this.logger.error(`Reconcile: failed to load ${status} payments: ${error.message}`);
      throw error;
    }
    return (data ?? []) as CandidatePayment[];
  }

  private async reconcileOne(payment: CandidatePayment, result: ReconcileJobResult): Promise<void> {
    const info = await this.lookup.getPayment(payment.order_code);
    if (!info) {
      result.skipped++;
      return;
    }

    if (info.status === "PAID") {
      await this.confirmPaid(payment, info, result);
      return;
    }

    // Payment EXPIRED đã xử lý xong ở phía ta; chỉ còn khả năng tiền về muộn (nhánh PAID ở trên).
    if (payment.status !== "PENDING") {
      result.skipped++;
      return;
    }

    if (info.status === "CANCELLED" || info.status === "EXPIRED") {
      // Huỷ theo payment (khoá + kiểm lại trong DB): không đụng link mới nếu khách vừa tạo lại.
      const { data, error } = await this.supabase.admin().rpc("cancel_stale_payment", {
        p_payment_id: payment.id,
        p_reason: info.status === "EXPIRED" ? "EXPIRED" : "CANCELLED",
      });
      if (error) throw error;
      const outcome = data as { status?: string } | null;
      if (outcome?.status === "SKIPPED") result.skipped++;
      else if (info.status === "EXPIRED") result.expired++;
      else result.cancelled++;
      return;
    }

    result.skipped++;
  }

  private async confirmPaid(
    payment: CandidatePayment,
    info: PayosPaymentInfo,
    result: ReconcileJobResult,
  ): Promise<void> {
    const outcome = await this.paymentService.handleWebhook({
      orderCode: payment.order_code,
      amount: info.amountPaid,
      // Cùng fallback với webhook để record_payment_event idempotent giữa webhook và đối soát.
      reference: info.reference ?? `PAYOS_${payment.order_code}`,
      code: PAYOS_SUCCESS_CODE,
      transactionDateTime: info.transactionDateTime,
    });
    if (!outcome.success) throw new Error("handleWebhook failed");

    const status = (outcome.status ?? "").toUpperCase();
    if (status === "SUCCESS") result.paid++;
    else if (status === "ALREADY_PAID") result.alreadyPaid++;
    else result.needsReview++;
  }
}
