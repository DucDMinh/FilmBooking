import { Inject, Injectable } from "@nestjs/common";
import { ERROR_CODES } from "@filmbooking/shared";
import {
  SCAN_RESULT_COLOR,
  type ScanResult,
  type ScanTicketInput,
  type ScanTicketResponse,
} from "@filmbooking/shared/schemas/checkin";
import type { AuthUser } from "../../common/auth/decorators";
import { AppException } from "../../common/errors/app-exception";
import { SupabaseService } from "../../common/supabase/supabase.service";

/** `checkin_ticket` trả jsonb tự do; chỉ đọc các khoá đã biết, không bao giờ chuyển tiếp nguyên object. */
type RpcPayload = Record<string, unknown>;

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** Chỉ giữ phần tử chuỗi: payload RPC là jsonb tự do, không tin kiểu của nó. */
const textList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/** Đổi `status` của RPC sang kết quả API. RPC gộp "không thấy vé" và "đơn chưa thanh toán" dưới INVALID. */
function toScanResult(payload: RpcPayload): ScanResult {
  switch (payload.status) {
    case "OK":
      return "OK";
    case "USED":
      return "USED";
    case "WRONG_CINEMA":
      return "WRONG_CINEMA";
    case "CANCELLED":
      return "CANCELLED";
    case "EXPIRED":
      return "EXPIRED";
    case "TOO_EARLY":
      return "TOO_EARLY";
    case "INVALID":
      return payload.order_status === undefined ? "NOT_FOUND" : "NOT_PAID";
    default:
      throw new Error(`Unexpected checkin_ticket status: ${String(payload.status)}`);
  }
}

/** Dựng phản hồi từ danh sách trắng theo từng kết quả — dữ liệu khách (tên, email) không bao giờ lọt vào. */
function toResponse(payload: RpcPayload): ScanTicketResponse {
  const result = toScanResult(payload);
  const base = { result, color: SCAN_RESULT_COLOR[result], message: text(payload.message) };
  switch (result) {
    case "OK": {
      const seats = textList(payload.seats);
      return {
        ...base,
        order: {
          orderId: text(payload.order_id),
          bookingCode: text(payload.booking_code),
          movieTitle: text(payload.movie_title),
          cinemaName: text(payload.cinema_name),
          roomName: text(payload.room_name),
          seats,
          seatCount: seats.length,
          startsAt: text(payload.starts_at),
          checkedInAt: text(payload.checked_in_at),
        },
      };
    }
    case "USED":
      return {
        ...base,
        used: { checkedInAt: text(payload.checked_in_at), staffName: text(payload.staff_name) },
      };
    case "WRONG_CINEMA":
      return {
        ...base,
        correctCinema: {
          id: text(payload.correct_cinema_id),
          code: text(payload.correct_cinema_code),
          name: text(payload.correct_cinema_name),
          address: typeof payload.correct_cinema_address === "string" ? payload.correct_cinema_address : null,
        },
      };
    case "TOO_EARLY":
      return { ...base, startsAt: text(payload.starts_at) };
    default:
      return base;
  }
}

@Injectable()
export class CheckinService {
  constructor(@Inject(SupabaseService) private readonly supabase: SupabaseService) {}

  /**
   * Gọi RPC bằng client mang JWT của user (không phải service role): RPC tự kiểm `has_cinema_scope`
   * và ép `scanned_by = auth.uid()`. Guard Nest đã chặn rạp không được gán trước đó (lớp thứ hai).
   */
  async scan(user: AuthUser, input: ScanTicketInput): Promise<ScanTicketResponse> {
    const code = input.token ?? input.bookingCode ?? "";
    const { data, error } = await this.supabase.forUser(user.jwt).rpc("checkin_ticket", {
      p_token_or_code: code,
      p_cinema_id: input.cinemaId,
      p_staff_id: user.id,
    });
    if (error) {
      if (error.code === "42501") throw new AppException(ERROR_CODES.FORBIDDEN_CINEMA, "No access to this cinema");
      throw error;
    }
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("checkin_ticket returned an unexpected payload");
    }
    return toResponse(data as RpcPayload);
  }
}
