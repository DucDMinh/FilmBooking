"use client";

import {
  createVoucherSchema,
  updateVoucherSchema,
  type PagedDto,
  type VoucherDto,
} from "@filmbooking/shared/schemas/admin";
import { formatVnd } from "@filmbooking/shared";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, apiFetch } from "@/lib/api/client";
import type { AdminRole } from "./nav-config";

const PAGE_SIZE = 20;

const APPLIES_LABEL: Record<VoucherDto["appliesTo"], string> = {
  TICKET: "Vé",
  COMBO: "Combo",
  ORDER: "Cả đơn",
};

const SELECT_CLASS =
  "h-11 w-full border border-border-input bg-transparent px-3 text-body-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring";

interface FormState {
  code: string;
  discountType: VoucherDto["discountType"];
  discountValue: string;
  maxDiscount: string;
  appliesTo: VoucherDto["appliesTo"];
  validFrom: string;
  validTo: string;
  minOrderAmount: string;
  totalUsesLimit: string;
  perUserLimit: string;
  active: boolean;
}

const EMPTY_FORM: FormState = {
  code: "",
  discountType: "PERCENT",
  discountValue: "",
  maxDiscount: "",
  appliesTo: "ORDER",
  validFrom: "",
  validTo: "",
  minOrderAmount: "0",
  totalUsesLimit: "",
  perUserLimit: "",
  active: true,
};

/** ISO (UTC) -> giá trị cho input datetime-local theo giờ máy. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromVoucher(v: VoucherDto): FormState {
  return {
    code: v.code,
    discountType: v.discountType,
    discountValue: String(v.discountValue),
    maxDiscount: v.maxDiscount === null ? "" : String(v.maxDiscount),
    appliesTo: v.appliesTo,
    validFrom: toLocalInput(v.validFrom),
    validTo: toLocalInput(v.validTo),
    minOrderAmount: String(v.minOrderAmount),
    totalUsesLimit: v.totalUsesLimit === null ? "" : String(v.totalUsesLimit),
    perUserLimit: v.perUserLimit === null ? "" : String(v.perUserLimit),
    active: v.active,
  };
}

/** Chuỗi rỗng -> null; còn lại -> số (NaN nếu không phải số, để schema báo lỗi). */
const optionalNumber = (s: string): number | null => (s.trim() === "" ? null : Number(s));
const optionalIso = (s: string): string | null => {
  if (s === "") return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
};

/** Dựng body từ form; `movieId` không có trên UI nên không gửi (giữ nguyên khi sửa). */
function buildVoucherBody(form: FormState) {
  return {
    code: form.code,
    discountType: form.discountType,
    discountValue: Number(form.discountValue),
    maxDiscount: form.discountType === "PERCENT" ? optionalNumber(form.maxDiscount) : null,
    appliesTo: form.appliesTo,
    validFrom: optionalIso(form.validFrom),
    validTo: optionalIso(form.validTo),
    minOrderAmount: Number(form.minOrderAmount),
    totalUsesLimit: optionalNumber(form.totalUsesLimit),
    perUserLimit: optionalNumber(form.perUserLimit),
    active: form.active,
  };
}

export function describeDiscount(v: Pick<VoucherDto, "discountType" | "discountValue" | "maxDiscount">): string {
  if (v.discountType === "FIXED") return formatVnd(v.discountValue);
  const cap = v.maxDiscount === null ? "" : ` • tối đa ${formatVnd(v.maxDiscount)}`;
  return `${v.discountValue}%${cap}`;
}

/** Thông điệp tiếng Việt theo trường (schema zod/API trả tiếng Anh). */
const FIELD_ERRORS: Record<string, string> = {
  code: "Mã gồm 3-32 ký tự: A-Z, 0-9, _ hoặc -.",
  discountValue: "Giá trị giảm phải là số nguyên từ 1 (tối đa 100 nếu giảm theo %).",
  maxDiscount: "Giảm tối đa phải là số nguyên từ 1 hoặc để trống.",
  validFrom: "Thời điểm bắt đầu không hợp lệ.",
  validTo: "Thời điểm kết thúc không hợp lệ hoặc không sau thời điểm bắt đầu.",
  minOrderAmount: "Giá trị đơn tối thiểu phải là số nguyên từ 0.",
  totalUsesLimit: "Tổng lượt phải là số nguyên từ 1 hoặc để trống.",
  perUserLimit: "Lượt mỗi khách phải là số nguyên từ 1 hoặc để trống.",
  movieId: "Phim liên kết không hợp lệ.",
};
const FORM_ERROR = "Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại các trường.";

function voucherStatus(v: VoucherDto, now: number): { label: string; variant: "success" | "neutral" | "danger" } {
  if (v.validTo && Date.parse(v.validTo) < now) return { label: "Hết hạn", variant: "danger" };
  if (!v.active) return { label: "Tạm dừng", variant: "neutral" };
  if (v.validFrom && Date.parse(v.validFrom) > now) return { label: "Sắp chạy", variant: "neutral" };
  return { label: "Đang chạy", variant: "success" };
}

function formatDay(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("vi-VN");
}

interface VoucherFormProps {
  open: boolean;
  /** null = tạo mới; có giá trị = sửa. */
  voucher: VoucherDto | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

/** Form voucher toàn chuỗi (R-90) dạng Sheet phải. Chỉ Admin được mở (API tự chặn Manager bằng 403). */
export function VoucherForm({ open, voucher, onOpenChange, onSaved }: Readonly<VoucherFormProps>) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(voucher ? fromVoucher(voucher) : EMPTY_FORM);
      setErrors({});
    }
  }, [open, voucher]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body = buildVoucherBody(form);
    const parsed = (voucher ? updateVoucherSchema : createVoucherSchema).safeParse(body);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "form");
        next[field] ??= FIELD_ERRORS[field] ?? FORM_ERROR;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      if (voucher) await apiFetch(`/admin/vouchers/${voucher.id}`, { method: "PATCH", json: parsed.data });
      else await apiFetch("/admin/vouchers", { method: "POST", json: parsed.data });
      toast.success(voucher ? "Đã cập nhật voucher." : "Đã tạo voucher.");
      onSaved();
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Đã có lỗi xảy ra. Vui lòng thử lại sau.";
      if (error instanceof ApiError && error.code === "CONFLICT") {
        // CONFLICT khi tạo/sửa = mã trùng.
        setErrors({ code: "Mã voucher đã tồn tại." });
      } else if (error instanceof ApiError && error.code === "VALIDATION_ERROR") {
        const field = error.details?.field;
        const known = typeof field === "string" ? FIELD_ERRORS[field] : undefined;
        setErrors(typeof field === "string" && known ? { [field]: known } : { form: message });
      } else {
        setErrors({ form: message });
      }
    } finally {
      setBusy(false);
    }
  };

  const fieldError = (name: string) =>
    errors[name] ? (
      <p role="alert" className="text-caption text-danger-text">
        {errors[name]}
      </p>
    ) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="overflow-y-auto">
        <form onSubmit={(e) => void submit(e)} noValidate className="flex min-h-full flex-col gap-4">
          <SheetHeader>
            <SheetTitle>{voucher ? "Sửa voucher" : "Tạo voucher"}</SheetTitle>
            <SheetDescription>Voucher áp dụng toàn chuỗi.</SheetDescription>
          </SheetHeader>
          <div className="space-y-1">
            <Label htmlFor="voucher-code">Mã voucher *</Label>
            <Input
              id="voucher-code"
              value={form.code}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
              aria-invalid={errors.code ? true : undefined}
            />
            {fieldError("code")}
          </div>
          <div className="space-y-1">
            <Label htmlFor="voucher-type">Loại giảm</Label>
            <select
              id="voucher-type"
              className={SELECT_CLASS}
              value={form.discountType}
              onChange={(e) => set("discountType", e.target.value as FormState["discountType"])}
            >
              <option value="PERCENT">Phần trăm (%)</option>
              <option value="FIXED">Số tiền cố định (đ)</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="voucher-value">{form.discountType === "PERCENT" ? "Giá trị giảm (%)" : "Giá trị giảm (đ)"}</Label>
            <Input
              id="voucher-value"
              inputMode="numeric"
              value={form.discountValue}
              onChange={(e) => set("discountValue", e.target.value)}
              aria-invalid={errors.discountValue ? true : undefined}
            />
            {fieldError("discountValue")}
          </div>
          {form.discountType === "PERCENT" ? (
            <div className="space-y-1">
              <Label htmlFor="voucher-max">Giảm tối đa (đ, tuỳ chọn)</Label>
              <Input
                id="voucher-max"
                inputMode="numeric"
                value={form.maxDiscount}
                onChange={(e) => set("maxDiscount", e.target.value)}
                aria-invalid={errors.maxDiscount ? true : undefined}
              />
              {fieldError("maxDiscount")}
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="voucher-applies">Áp dụng cho</Label>
            <select
              id="voucher-applies"
              className={SELECT_CLASS}
              value={form.appliesTo}
              onChange={(e) => set("appliesTo", e.target.value as FormState["appliesTo"])}
            >
              <option value="ORDER">Cả đơn</option>
              <option value="TICKET">Vé</option>
              {form.appliesTo === "COMBO" ? <option value="COMBO">Combo</option> : null}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="voucher-from">Hiệu lực từ</Label>
            <Input id="voucher-from" type="datetime-local" value={form.validFrom} onChange={(e) => set("validFrom", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="voucher-to">Hiệu lực đến</Label>
            <Input
              id="voucher-to"
              type="datetime-local"
              value={form.validTo}
              onChange={(e) => set("validTo", e.target.value)}
              aria-invalid={errors.validTo ? true : undefined}
            />
            {fieldError("validTo")}
          </div>
          <div className="space-y-1">
            <Label htmlFor="voucher-min">Giá trị đơn tối thiểu (đ)</Label>
            <Input
              id="voucher-min"
              inputMode="numeric"
              value={form.minOrderAmount}
              onChange={(e) => set("minOrderAmount", e.target.value)}
              aria-invalid={errors.minOrderAmount ? true : undefined}
            />
            {fieldError("minOrderAmount")}
          </div>
          <div className="space-y-1">
            <Label htmlFor="voucher-total">Tổng lượt dùng (trống = không giới hạn)</Label>
            <Input
              id="voucher-total"
              inputMode="numeric"
              value={form.totalUsesLimit}
              onChange={(e) => set("totalUsesLimit", e.target.value)}
              aria-invalid={errors.totalUsesLimit ? true : undefined}
            />
            {fieldError("totalUsesLimit")}
          </div>
          <div className="space-y-1">
            <Label htmlFor="voucher-per-user">Lượt mỗi khách (trống = không giới hạn)</Label>
            <Input
              id="voucher-per-user"
              inputMode="numeric"
              value={form.perUserLimit}
              onChange={(e) => set("perUserLimit", e.target.value)}
              aria-invalid={errors.perUserLimit ? true : undefined}
            />
            {fieldError("perUserLimit")}
          </div>
          <label className="flex items-center gap-2 text-body-sm">
            <input type="checkbox" className="size-4" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
            Đang hoạt động
          </label>
          {fieldError("form")}
          <SheetFooter className="mt-auto">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Huỷ
            </Button>
            <Button type="submit" disabled={busy}>
              Lưu
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** Màn 25: danh sách voucher. Admin tạo/sửa; Manager chỉ xem (R-90, R-93). */
export function VoucherManager({ role }: Readonly<{ role: AdminRole }>) {
  const isAdmin = role === "ADMIN";
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PagedDto<VoucherDto> | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [editing, setEditing] = useState<VoucherDto | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setData(await apiFetch<PagedDto<VoucherDto>>(`/admin/vouchers?page=${page}&pageSize=${PAGE_SIZE}`));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  const openForm = (voucher: VoucherDto | null) => {
    setEditing(voucher);
    setFormOpen(true);
  };

  const now = Date.now();
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section className="space-y-4">
      {isAdmin ? (
        <div>
          <Button onClick={() => openForm(null)}>＋ Tạo voucher</Button>
        </div>
      ) : (
        <p className="text-body-sm text-fg-muted">Chỉ Admin tạo/sửa voucher.</p>
      )}
      {status === "loading" ? <LoadingState label="Đang tải voucher…" /> : null}
      {status === "error" ? <ErrorState onRetry={() => void load()} /> : null}
      {status === "ready" && data && data.items.length === 0 ? <EmptyState title="Chưa có voucher" /> : null}
      {status === "ready" && data && data.items.length > 0 ? (
        <>
          <div className="overflow-x-auto border border-border-subtle">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã</TableHead>
                  <TableHead>Giảm</TableHead>
                  <TableHead>Áp dụng</TableHead>
                  <TableHead>Thời hạn</TableHead>
                  <TableHead>Tổng lượt</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  {isAdmin ? <TableHead className="w-24" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((v) => {
                  const st = voucherStatus(v, now);
                  return (
                    <TableRow key={v.id}>
                      <TableCell className="font-semibold">{v.code}</TableCell>
                      <TableCell className="tabular">{describeDiscount(v)}</TableCell>
                      <TableCell>{APPLIES_LABEL[v.appliesTo]}</TableCell>
                      <TableCell className="tabular">
                        {formatDay(v.validFrom)} - {formatDay(v.validTo)}
                      </TableCell>
                      <TableCell className="tabular">{v.totalUsesLimit ?? "Không giới hạn"}</TableCell>
                      <TableCell>
                        <Badge tone={st.variant}>{st.label}</Badge>
                      </TableCell>
                      {isAdmin ? (
                        <TableCell>
                          <Button variant="ghost" className="shadow-none bg-transparent" size="sm" onClick={() => openForm(v)} aria-label={`Sửa voucher ${v.code}`}>
                            Sửa
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 ? (
            <div className="flex items-center gap-3">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Trước
              </Button>
              <span className="tabular text-body-sm">
                {page} / {totalPages}
              </span>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Sau
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
      {isAdmin ? (
        <VoucherForm open={formOpen} voucher={editing} onOpenChange={setFormOpen} onSaved={() => void load()} />
      ) : null}
    </section>
  );
}
