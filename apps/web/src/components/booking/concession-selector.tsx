"use client";

import {
  MAX_COMBO_QUANTITY,
  type BookingSummaryResponse,
  type ComboDto,
  type OrderComboItemDto,
} from "@filmbooking/shared/schemas/booking";
import { formatVnd } from "@filmbooking/shared";
import { Loader2, Minus, Plus, Popcorn } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { RemoteImage } from "@/components/common/remote-image";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface ConcessionSelectorProps {
  readonly orderId: string;
  readonly selectedCombos?: readonly OrderComboItemDto[];
  readonly onSummaryChanged: (summary: BookingSummaryResponse) => void;
  /** Gọi khi server báo đơn hết hạn giữ chỗ để trang chuyển sang trạng thái hết hạn. */
  readonly onExpired?: () => void;
  readonly disabled?: boolean;
}

/** Lỗi tải danh mục chỉ ẩn khối bắp nước, không được chặn luồng thanh toán. */
function useActiveCombos(): { combos: ComboDto[]; loading: boolean } {
  const [combos, setCombos] = useState<ComboDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const list = await apiFetch<ComboDto[]>("/combos");
        if (!cancelled) setCombos(Array.isArray(list) ? list : []);
      } catch {
        // Giữ danh sách rỗng: khối bắp nước ẩn đi.
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { combos, loading };
}

function ComboThumbnail({ combo }: Readonly<{ combo: ComboDto }>) {
  // Ảnh do admin nhập có thể sai đường dẫn: lỗi tải thì quay về biểu tượng thay vì hiện ảnh vỡ.
  const [hasError, setHasError] = useState(false);
  return (
    <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded border border-border/50 bg-surface text-brand">
      {combo.imageUrl && !hasError ? (
        <RemoteImage
          src={combo.imageUrl}
          alt={combo.name}
          sizes="56px"
          className="size-full object-cover"
          onError={() => setHasError(true)}
        />
      ) : (
        <Popcorn className="size-6 text-fg-muted" aria-hidden="true" />
      )}
    </div>
  );
}

interface QuantityStepperProps {
  readonly comboName: string;
  readonly quantity: number;
  readonly updating: boolean;
  readonly locked: boolean;
  readonly onChange: (quantity: number) => void;
}

function QuantityStepper({ comboName, quantity, updating, locked, onChange }: QuantityStepperProps) {
  return (
    <div className="mt-3 flex items-center justify-end gap-1 border-t border-border/40 pt-2.5">
      <Button
        type="button"
        variant="outline"
        className="size-11 p-0"
        disabled={quantity === 0 || locked}
        onClick={() => onChange(quantity - 1)}
        aria-label={`Giảm số lượng ${comboName}`}
      >
        <Minus className="size-4" />
      </Button>
      <span className="w-9 text-center text-body-sm font-bold tabular" aria-live="polite">
        {updating ? <Loader2 className="inline size-4 animate-spin text-brand" /> : quantity}
      </span>
      <Button
        type="button"
        variant="outline"
        className="size-11 p-0"
        disabled={quantity >= MAX_COMBO_QUANTITY || locked}
        onClick={() => onChange(quantity + 1)}
        aria-label={`Tăng số lượng ${comboName}`}
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
}

function ComboCard({
  combo,
  ...stepper
}: { readonly combo: ComboDto } & Omit<QuantityStepperProps, "comboName">) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between border border-border bg-surface-elevated p-3.5 transition-colors sm:p-4",
        stepper.quantity > 0 && "border-brand/60",
      )}
    >
      <div className="flex items-start gap-3">
        <ComboThumbnail combo={combo} />
        <div className="min-w-0 flex-1">
          <p className="font-heading text-body font-bold text-fg">{combo.name}</p>
          {combo.description ? (
            <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-fg-secondary">{combo.description}</p>
          ) : null}
          <p className="mt-1 text-body-sm font-semibold text-brand tabular">{formatVnd(combo.priceAmount)}</p>
        </div>
      </div>
      <QuantityStepper comboName={combo.name} {...stepper} />
    </div>
  );
}

interface QuantityUpdateArgs extends Pick<ConcessionSelectorProps, "orderId" | "onSummaryChanged" | "onExpired"> {
  readonly combos: readonly ComboDto[];
  readonly quantityById: ReadonlyMap<string, number>;
}

function useQuantityUpdate({ orderId, combos, quantityById, onSummaryChanged, onExpired }: QuantityUpdateArgs) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function change(comboId: string, quantity: number) {
    setError(null);
    setUpdatingId(comboId);
    const next = new Map(quantityById).set(comboId, quantity);
    // Chỉ gửi combo còn bán: combo đã ngừng bán làm RPC từ chối cả lượt cập nhật (COMBO_NOT_FOUND).
    const items = combos
      .map((combo) => ({ comboId: combo.id, quantity: next.get(combo.id) ?? 0 }))
      .filter((item) => item.quantity > 0);
    try {
      onSummaryChanged(
        await apiFetch<BookingSummaryResponse>(`/bookings/${orderId}/combos`, { method: "PUT", json: { items } }),
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === "HOLD_EXPIRED") onExpired?.();
      setError(err instanceof ApiError ? err.message : "Không thể cập nhật combo bắp nước");
    } finally {
      setUpdatingId(null);
    }
  }

  return { updatingId, error, change };
}

function ConcessionFrame({ error, children }: Readonly<{ error: string | null; children: ReactNode }>) {
  return (
    <section aria-labelledby="concession-title" className="frame">
      <div className="frame-in space-y-4 p-4 sm:p-6">
        <div className="flex items-center gap-2">
          <Popcorn className="size-5 text-brand" aria-hidden="true" />
          <h2 id="concession-title" className="font-heading text-h3 font-bold">
            Bắp nước & Combo
          </h2>
        </div>
        <p className="text-body-sm text-fg-secondary">
          Thưởng thức bắp rang thơm ngon và nước ngọt mát lạnh khi xem phim. Nhận tại quầy bằng mã vé.
        </p>
        {error ? (
          <p role="alert" className="border-l-[3px] border-danger bg-danger-banner px-3 py-2 text-body-sm text-danger-strong">
            {error}
          </p>
        ) : null}
        {children}
      </div>
    </section>
  );
}

export function ConcessionSelector({
  orderId,
  selectedCombos = [],
  onSummaryChanged,
  onExpired,
  disabled = false,
}: ConcessionSelectorProps) {
  const { combos, loading } = useActiveCombos();
  const quantityById = new Map(selectedCombos.map((c) => [c.comboId, c.quantity]));
  const { updatingId, error, change } = useQuantityUpdate({
    orderId,
    combos,
    quantityById,
    onSummaryChanged,
    onExpired,
  });

  if (loading) {
    return (
      <p role="status" className="flex items-center justify-center p-6 text-body-sm text-fg-secondary">
        <Loader2 className="mr-2 size-5 animate-spin text-brand" aria-hidden="true" />
        Đang tải danh mục bắp nước...
      </p>
    );
  }
  if (combos.length === 0) return null;

  return (
    <ConcessionFrame error={error}>
      <div className="grid gap-3 sm:grid-cols-2">
        {combos.map((combo) => (
          <ComboCard
            key={combo.id}
            combo={combo}
            quantity={quantityById.get(combo.id) ?? 0}
            updating={updatingId === combo.id}
            locked={disabled || updatingId !== null}
            onChange={(quantity) => void change(combo.id, quantity)}
          />
        ))}
      </div>
    </ConcessionFrame>
  );
}
