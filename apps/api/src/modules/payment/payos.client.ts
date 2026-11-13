import { Inject, Injectable, Logger } from "@nestjs/common";
import { PayOS } from "@payos/node";
import {
  payosWebhookDataSchema,
  type PayosWebhookData,
} from "@filmbooking/shared/schemas/payment";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ENV, type Env } from "../../config/env";

export interface CreatePaymentLinkParams {
  orderCode: number;
  amount: number;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  expiredAt?: number;
}

export interface CreatePaymentLinkResult {
  checkoutUrl: string;
  paymentLinkId?: string;
}

@Injectable()
export class PayosClient {
  private readonly logger = new Logger(PayosClient.name);
  private payOS?: PayOS;

  constructor(@Inject(ENV) private readonly env: Env) {
    if (
      this.env.PAYOS_CLIENT_ID &&
      this.env.PAYOS_API_KEY &&
      this.env.PAYOS_CHECKSUM_KEY
    ) {
      try {
        this.payOS = new PayOS({
          clientId: this.env.PAYOS_CLIENT_ID,
          apiKey: this.env.PAYOS_API_KEY,
          checksumKey: this.env.PAYOS_CHECKSUM_KEY,
        });
      } catch (err) {
        this.logger.warn(`Failed to initialize PayOS client: ${(err as Error).message}`);
      }
    }
  }

  /**
   * Tính chữ ký HMAC SHA256 theo chuẩn PayOS:
   * Sắp xếp các khoá của object theo alphabet, ghép chuỗi 'key=value&...', rồi băm HMAC SHA256.
   */
  computeSignature(data: Record<string, unknown>, checksumKey: string): string {
    if (!data || !checksumKey) return "";
    const sortedKeys = Object.keys(data).sort();
    const queryStr = sortedKeys
      .map((k) => `${k}=${data[k] === null || data[k] === undefined ? "" : String(data[k])}`)
      .join("&");
    return createHmac("sha256", checksumKey).update(queryStr).digest("hex");
  }

  /**
   * Tạo payment link PayOS (R-73).
   */
  async createPaymentLink(params: CreatePaymentLinkParams): Promise<CreatePaymentLinkResult> {
    if (this.payOS && this.env.NODE_ENV !== "test") {
      const response = await this.payOS.paymentRequests.create({
        orderCode: params.orderCode,
        amount: params.amount,
        description: params.description,
        returnUrl: params.returnUrl,
        cancelUrl: params.cancelUrl,
        expiredAt: params.expiredAt,
      });
      return {
        checkoutUrl: response.checkoutUrl,
        paymentLinkId: response.paymentLinkId,
      };
    }

    if (this.env.NODE_ENV === "production") {
      throw new Error("PayOS client is not configured in production environment");
    }

    // Fallback cho môi trường dev / test khi chưa cấu hình credentials thật hoặc chạy test (R-84)
    this.logger.warn("PayOS credentials not configured or running in test, returning mock checkout URL");
    return {
      checkoutUrl: `https://pay.payos.vn/web/${params.orderCode}`,
      paymentLinkId: `mock_link_${params.orderCode}`,
    };
  }

  /**
   * Huỷ payment link trên PayOS (R-77, SPEC #10).
   */
  async cancelPaymentLink(orderCode: number, reason = "Cancelled"): Promise<boolean> {
    if (!this.payOS || this.env.NODE_ENV === "test") return true;
    try {
      await this.payOS.paymentRequests.cancel(orderCode, reason);
      return true;
    } catch (err) {
      this.logger.warn(
        `Failed to cancel PayOS payment link for orderCode=${orderCode}: ${(err as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Kiểm tra chữ ký webhook và parse data nếu hợp lệ.
   */
  async verifyWebhook(envelope: {
    data: Record<string, unknown>;
    signature: string;
  }): Promise<PayosWebhookData | null> {
    const checksumKey = this.env.PAYOS_CHECKSUM_KEY;
    if (!checksumKey) {
      this.logger.warn("PAYOS_CHECKSUM_KEY is not configured");
      return null;
    }

    const expectedSignature = this.computeSignature(envelope.data, checksumKey);
    if (!expectedSignature || !envelope.signature) {
      return null;
    }

    const expectedBuf = Buffer.from(expectedSignature, "utf8");
    const actualBuf = Buffer.from(envelope.signature, "utf8");
    if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
      return null;
    }

    const parseResult = payosWebhookDataSchema.safeParse(envelope.data);
    if (!parseResult.success) {
      this.logger.warn("PayOS webhook data does not match schema", parseResult.error);
      return null;
    }

    return parseResult.data;
  }
}
