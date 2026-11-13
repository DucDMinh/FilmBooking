/**
 * Internal database row types cho OrdersModule.
 * Tách riêng để tái sử dụng và đảm bảo quy chuẩn AI-readable codebase (D/M8).
 */

export interface OrderDbRow {
  id: string;
  booking_code: string | null;
  channel: string;
  cinema_id: string;
  cinema_code: string;
  cinema_name: string;
  showtime_id: string;
  movie_title: string;
  room_name: string;
  showtime_starts_at: string;
  showtime_ends_at: string;
  status: string;
  subtotal_amount: number;
  discount_amount: number;
  total_amount: number;
  user_id: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  manual_review_resolved_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  tickets?: {
    id: string;
    order_seat_id?: string;
    showtime_id?: string;
    cinema_id?: string;
    qr_token?: string;
    checked_in_at?: string | null;
    checked_in_by?: string | null;
    seat_label?: string;
    seat_type?: string;
    price_amount?: number;
  }[];
  payments?: {
    id: string;
    order_code: number;
    amount: number;
    status: string;
    transaction_ref: string | null;
    paid_at: string | null;
    payment_link_id: string | null;
    created_at: string;
  }[];
  order_seats?: {
    id: string;
    seat_id: string;
    seat_label: string;
    seat_type: string;
    price_amount: number;
  }[];
  affected_order_actions?: {
    action: string;
    note: string | null;
    refund_reference: string | null;
    refunded_amount: number | null;
    created_at: string;
  }[];
}

export interface OrderSeatDbRow {
  id: string;
  seat_id: string;
  seat_label: string;
  seat_type: string;
  price_amount: number;
}

export interface TicketDbRow {
  id: string;
  order_seat_id?: string;
  showtime_id?: string;
  cinema_id?: string;
  qr_token?: string;
  checked_in_at?: string | null;
  checked_in_by?: string | null;
  seat_label?: string;
  seat_type?: string;
  price_amount?: number;
}

export interface PaymentDbRow {
  id: string;
  order_code: number;
  amount: number;
  status: string;
  transaction_ref: string | null;
  paid_at: string | null;
  payment_link_id: string | null;
  created_at: string;
}

export interface AuditDbRow {
  occurred_at: string;
  action: string;
  before_data?: Record<string, unknown> | null;
  after_data?: Record<string, unknown> | null;
}

export interface AffectedActionDbRow {
  action: string;
  note: string | null;
  refund_reference: string | null;
  refunded_amount: number | null;
  created_at: string;
}

export interface EmailOutboxRow {
  id: string;
  to_email: string;
  kind: string;
  last_error: string | null;
  attempts: number;
  created_at: string;
}

export interface RawShowtimeRow {
  id: string;
  cinema_id: string;
  room_id: string;
  movie_id: string;
  format: string;
  starts_at: string;
  ends_at: string;
  status?: string;
  movies?: { title_vi: string } | { title_vi: string }[] | null;
}
