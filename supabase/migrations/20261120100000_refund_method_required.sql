-- ============================================================================
-- Migration: 20261120100000_refund_method_required.sql
-- bug refund-method-required phase-1 task-01 (CR-005, GAP-009, R-110, AC-25).
-- Hoàn tiền thủ công phải ghi đủ: số tiền, ngày hoàn, phương thức, mã giao dịch ngân hàng, người thực hiện.
-- Bảng chỉ có refund_reference/refunded_amount/performed_by -> thêm refund_method + refunded_at.
--
-- KHÔNG destructive, KHÔNG backfill, KHÔNG đổi/xoá dữ liệu hiện có (không phải HIGH_RISK_MIGRATION):
--   * 2 cột mới nullable (thêm cột nullable không ghi lại hàng cũ).
--   * CHECK mới thêm kiểu NOT VALID: chỉ kiểm tra hàng ghi/sửa SAU migration; các dòng REFUNDED_MANUAL cũ
--     (chưa có phương thức/ngày) giữ nguyên, hiển thị "chưa ghi" ở UI, không bị gán giá trị bịa.
--   * bảng chỉ INSERT (không có luồng UPDATE) nên dòng cũ không bao giờ bị CHECK mới chặn.
-- Rollback: alter table public.affected_order_actions
--   drop constraint affected_order_actions_refund_method_ck,
--   drop constraint affected_order_actions_refunded_manual_full_ck,
--   drop column refund_method, drop column refunded_at;
--   (revoke insert (refund_method, refunded_at) tự mất khi drop cột.)
-- ============================================================================

alter table public.affected_order_actions
  add column refund_method text,
  add column refunded_at   date;

-- Phương thức thuộc tập cố định (khớp REFUND_METHODS ở packages/shared).
alter table public.affected_order_actions
  add constraint affected_order_actions_refund_method_ck
  check (refund_method is null or refund_method in ('BANK_TRANSFER', 'E_WALLET', 'CASH', 'OTHER'));

-- Hoàn thủ công phải đủ phương thức + ngày hoàn (bổ sung cho check mã tham chiếu/số tiền sẵn có).
-- NOT VALID: dữ liệu cũ không bị quét/phá; hàng mới luôn bị kiểm tra.
alter table public.affected_order_actions
  add constraint affected_order_actions_refunded_manual_full_ck
  check (action <> 'REFUNDED_MANUAL' or (refund_method is not null and refunded_at is not null))
  not valid;

-- Staff/Manager ghi trực tiếp qua RLS (quyết định #6): cấp thêm quyền insert cho 2 cột mới.
grant insert (refund_method, refunded_at) on public.affected_order_actions to authenticated;

comment on column public.affected_order_actions.refund_method is
  'Phương thức hoàn tiền thủ công: BANK_TRANSFER | E_WALLET | CASH | OTHER (bắt buộc với REFUNDED_MANUAL ghi từ 2026-11-20).';
comment on column public.affected_order_actions.refunded_at is
  'Ngày hoàn tiền thực tế do người thực hiện nhập (khác created_at = lúc hệ thống ghi nhận).';
