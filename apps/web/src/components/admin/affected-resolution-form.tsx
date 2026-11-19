"use client";

import { formatVnd } from "@filmbooking/shared";
import { recordRefundSchema, type RecordRefundResultDto } from "@filmbooking/shared/schemas/cancellation";
import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api/client";

import { TextField, writeErrorToFields, zodFieldErrors, type FieldErrors } from "./form-utils";

const FIELD_MESSAGES: Record<string, string> = {
  refundedAmount: "Nhập số tiền đã hoàn (số nguyên VND, từ 1)",
  refundReference: "Nhập mã giao dịch ngân hàng (tối đa 100 ký tự)",
  note: "Ghi chú tối đa 500 ký tự",
};

const THOUSANDS_GROUPED = /^\d{1,3}([.,\s]\d{3})+$/;

/**
 * Số tiền VND nguyên: chỉ chữ số, hoặc chữ số có dấu phân cách nghìn kiểu VN ("200.000").
 * Mọi dạng khác ("1e5", "1.5", "-3", "0x10") -> NaN, KHÔNG để Number() đoán (200.000 -> 200 là sai 1000 lần).
 */
export function parseRefundAmount(raw: string): number | undefined {
  const text = raw.trim();
  if (text === "") return undefined;
  if (/^\d+$/.test(text)) return Number(text);
  if (THOUSANDS_GROUPED.test(text)) return Number(text.replace(/[.,\s]/g, ""));
  return Number.NaN;
}

/** Thay thông điệp chung bằng thông điệp theo field; giữ nguyên `_form`. */
function localize(errors: FieldErrors): FieldErrors {
  const out: FieldErrors = {};
  for (const [key, message] of Object.entries(errors)) out[key] = FIELD_MESSAGES[key] ?? message;
  return out;
}

/** Form ghi kết quả xử lý duy nhất: "Đã hoàn tiền thủ công" (AC-25) — thiếu số tiền/mã GD thì không gửi. */
export function AffectedResolutionForm({
  orderId,
  totalAmount,
  onResolved,
}: Readonly<{ orderId: string; totalAmount: number; onResolved: () => void }>) {
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

  const previewValue = parseRefundAmount(amount);
  const amountPreview =
    previewValue !== undefined && Number.isFinite(previewValue) ? `Sẽ ghi nhận: ${formatVnd(previewValue)}` : undefined;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const amountValue = parseRefundAmount(amount);
    if (amountValue !== undefined && Number.isNaN(amountValue)) {
      setErrors({ refundedAmount: "Chỉ nhập chữ số, ví dụ 200000 hoặc 200.000" });
      return;
    }
    if (amountValue !== undefined && amountValue > totalAmount) {
      setErrors({ refundedAmount: `Số tiền hoàn không được vượt giá trị đơn (${formatVnd(totalAmount)})` });
      return;
    }
    const parsed = recordRefundSchema.safeParse({
      refundedAmount: amountValue,
      refundReference: reference,
      note: note.trim() === "" ? undefined : note,
    });
    if (!parsed.success) {
      setErrors(localize(zodFieldErrors(parsed.error)));
      return;
    }
    setErrors({});
    inFlight.current = true;
    setSubmitting(true);
    try {
      await apiFetch<RecordRefundResultDto>(`/admin/affected-orders/${orderId}/refund`, {
        method: "POST",
        json: parsed.data,
      });
      toast.success("Đã ghi nhận hoàn tiền thủ công");
      onResolved();
    } catch (error) {
      const mapped = localize(writeErrorToFields(error, { field: "_form", message: "Đơn này đã được xử lý." }));
      // 422 "vượt giá trị đơn" không kèm issues -> gắn vào ô số tiền thay vì thông điệp chung.
      const overAmount = error instanceof ApiError && error.status === 422 && mapped._form;
      setErrors(overAmount ? { refundedAmount: "Số tiền hoàn không hợp lệ hoặc vượt giá trị đơn" } : mapped);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="Ghi kết quả xử lý"
      className="space-y-4 border border-border-subtle bg-surface p-4 md:p-6"
    >
      <h2 className="text-h3 font-bold">Ghi kết quả xử lý</h2>
      <p className="text-body-sm text-fg-muted">
        Phương án duy nhất: Đã hoàn tiền thủ công. Giá trị đơn: {formatVnd(totalAmount)}.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField
          id="refundedAmount"
          label="Số tiền đã hoàn (VND)"
          value={amount}
          onChange={setAmount}
          error={errors.refundedAmount}
          hint={amountPreview}
          inputMode="numeric"
          required
          disabled={submitting}
        />
        <TextField
          id="refundReference"
          label="Mã giao dịch ngân hàng"
          value={reference}
          onChange={setReference}
          error={errors.refundReference}
          required
          disabled={submitting}
        />
        <TextField
          id="note"
          label="Ghi chú"
          value={note}
          onChange={setNote}
          error={errors.note}
          className="md:col-span-2"
          disabled={submitting}
        />
      </div>
      {errors._form ? (
        <p role="alert" className="text-small text-danger-text">
          {errors._form}
        </p>
      ) : null}
      <Button type="submit" disabled={submitting} className="min-h-11">
        {submitting ? "Đang lưu…" : "Xác nhận đã hoàn tiền"}
      </Button>
    </form>
  );
}
