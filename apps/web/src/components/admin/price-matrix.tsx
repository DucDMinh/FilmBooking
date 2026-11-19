"use client";

import type { CinemaDto } from "@filmbooking/shared/schemas/catalog";
import type {
  HolidayDto,
  PriceDayType,
  PriceRuleDto,
  PriceTimeBand,
  ScreenFormatPricing,
  SeatPricingType,
} from "@filmbooking/shared/schemas/pricing";
import { Trash2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Money } from "@/components/common/money";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, apiFetch } from "@/lib/api/client";
import type { AdminRole } from "./nav-config";
import { ALL_CINEMAS, resolveScope } from "./use-admin-scope";

const SEAT_TYPES: readonly SeatPricingType[] = ["NORMAL", "VIP", "SWEETBOX"];
const FORMATS: readonly ScreenFormatPricing[] = ["2D", "3D"];
const DAY_TYPES: readonly PriceDayType[] = ["NORMAL", "WEEKEND", "HOLIDAY"];
const TIME_BANDS: readonly PriceTimeBand[] = ["BEFORE_17", "AFTER_17"];

const SEAT_LABEL: Record<SeatPricingType, string> = { NORMAL: "Thường", VIP: "VIP", SWEETBOX: "Sweetbox" };
const DAY_LABEL: Record<PriceDayType, string> = { NORMAL: "Ngày thường", WEEKEND: "Cuối tuần", HOLIDAY: "Ngày lễ" };
const BAND_LABEL: Record<PriceTimeBand, string> = { BEFORE_17: "Trước 17h", AFTER_17: "Sau 17h" };

/** Cột amount là int4 trong DB: vượt mức này API sẽ lỗi 500. */
const MAX_PRICE_VND = 2_147_483_647;
export const PRICE_INVALID_MESSAGE = "Giá phải là số nguyên từ 0 đến 2.147.483.647 (VND).";

/** Chuỗi nhập -> số VND nguyên 0..2^31-1, hoặc null nếu không hợp lệ (rỗng, thập phân, âm, chữ, quá lớn). */
export function parseVndAmount(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value <= MAX_PRICE_VND ? value : null;
}

interface CellKey {
  seatType: SeatPricingType;
  format: ScreenFormatPricing;
  dayType: PriceDayType;
  timeBand: PriceTimeBand;
}

const keyOf = (c: CellKey) => `${c.seatType}|${c.format}|${c.dayType}|${c.timeBand}`;

function indexRules(rules: readonly PriceRuleDto[]): Map<string, PriceRuleDto> {
  const map = new Map<string, PriceRuleDto>();
  for (const rule of rules) {
    if (rule.format && rule.dayType && rule.timeBand) {
      map.set(
        keyOf({ seatType: rule.seatType, format: rule.format, dayType: rule.dayType, timeBand: rule.timeBand }),
        rule,
      );
    }
  }
  return map;
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Đã có lỗi xảy ra. Vui lòng thử lại sau.";
}

interface PriceCellProps {
  label: string;
  amount: number | null;
  /** override = ghi đè của rạp; chain = giá chuỗi; none = chưa có giá. */
  source: "override" | "chain" | "none";
  /** Đang xem một rạp: ô giá chuỗi được gắn nhãn "Kế thừa". */
  inheritedView: boolean;
  editable: boolean;
  busy: boolean;
  onSave: (amount: number) => void;
  onDelete: () => void;
}

function PriceCell({ label, amount, source, inheritedView, editable, busy, onSave, onDelete }: Readonly<PriceCellProps>) {
  // State khởi tạo một lần; cha đặt key theo giá trị để ô khởi tạo lại sau khi lưu (không dùng effect ghi đè chữ đang gõ).
  const initial = amount === null ? "" : String(amount);
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseVndAmount(text);
    if (parsed === null) {
      setError(PRICE_INVALID_MESSAGE);
      return;
    }
    setError(null);
    onSave(parsed);
  };

  let badge = null;
  if (source === "override") badge = <Badge tone="brand">Ghi đè</Badge>;
  else if (source === "chain" && inheritedView) badge = <Badge tone="neutral">Kế thừa</Badge>;

  if (!editable) {
    return (
      <div className="flex flex-col items-start gap-1">
        {amount === null ? <span className="text-fg-muted">-</span> : <Money amount={amount} />}
        {badge}
      </div>
    );
  }

  const dirty = text.trim() !== initial;
  return (
    <form onSubmit={submit} className="flex flex-col gap-1" noValidate>
      <div className="flex items-center gap-1">
        <Input
          inputMode="numeric"
          aria-label={label}
          aria-invalid={error ? true : undefined}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="tabular w-28"
          placeholder="-"
        />
        <span className="text-caption text-fg-muted">đ</span>
      </div>
      {error ? (
        <p role="alert" className="text-caption text-danger-text">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-1">
        {badge}
        {dirty ? (
          <Button type="submit" size="sm" disabled={busy} aria-label={`Lưu ${label}`}>
            Lưu
          </Button>
        ) : null}
        {source === "override" ? (
          <Button
            type="button"
            size="sm"
            variant="ghost" className="shadow-none bg-transparent"
            disabled={busy}
            onClick={onDelete}
            aria-label={`Xoá ghi đè ${label}`}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </form>
  );
}

interface PriceMatrixProps {
  role: AdminRole;
  /** Vai trò theo từng rạp được gán (từ /me). Admin xem mọi rạp qua /cinemas. */
  memberships: readonly { cinemaId: string; role: "STAFF" | "MANAGER" }[];
}

/**
 * Ma trận giá (R-52, AC-15): hàng = loại ghế x định dạng, cột = loại ngày x khung giờ.
 * Scope "Toàn chuỗi" (Admin): sửa giá chuỗi. Scope một rạp: hiện giá hiệu lực — ô ghi đè đánh dấu "Ghi đè",
 * ô còn lại "Kế thừa" giá chuỗi; Admin/Manager sửa/xoá ghi đè. Ẩn nút chỉ là UX, API vẫn trả 403.
 */
export function PriceMatrix({ role, memberships }: Readonly<PriceMatrixProps>) {
  const isAdmin = role === "ADMIN";
  const searchParams = useSearchParams();
  const [allCinemas, setAllCinemas] = useState<CinemaDto[]>([]);
  const [chain, setChain] = useState<Map<string, PriceRuleDto>>(new Map());
  const [overrides, setOverrides] = useState<Map<string, PriceRuleDto>>(new Map());
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<CinemaDto[]>("/cinemas")
      .then(setAllCinemas)
      .catch(() => setAllCinemas([]));
  }, []);

  const scopeCinemas = useMemo(() => {
    const ids = isAdmin ? allCinemas.flatMap((c) => (c.id ? [c.id] : [])) : memberships.map((m) => m.cinemaId);
    return ids.map((id) => ({ id, name: allCinemas.find((c) => c.id === id)?.name ?? `Rạp ${id.slice(0, 8)}` }));
  }, [isAdmin, allCinemas, memberships]);

  const scope = resolveScope(searchParams.get("cinema"), scopeCinemas, isAdmin);
  const cinemaId = scope === ALL_CINEMAS ? null : scope;
  const cinemaName = scopeCinemas.find((c) => c.id === cinemaId)?.name ?? "";

  // Mỗi lần load tăng id; response của lần load cũ (chồng nhau) bị bỏ qua.
  const latestLoad = useRef(0);
  /** `background`: làm mới sau khi lưu — giữ bảng đang hiển thị, không đặt lại trạng thái loading. */
  const load = useCallback(
    async (background = false) => {
      const id = ++latestLoad.current;
      if (!background) setStatus("loading");
      try {
        const chainRules = await apiFetch<PriceRuleDto[]>("/price-rules?scope=CHAIN");
        const cinemaRules = cinemaId
          ? await apiFetch<PriceRuleDto[]>(`/price-rules?scope=CINEMA&cinemaId=${cinemaId}`)
          : [];
        if (id !== latestLoad.current) return;
        setChain(indexRules(chainRules));
        setOverrides(indexRules(cinemaRules));
        setStatus("ready");
      } catch {
        if (id === latestLoad.current && !background) setStatus("error");
      }
    },
    [cinemaId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const editingChain = isAdmin && cinemaId === null;
  // Sửa ghi đè rạp: Admin, hoặc MANAGER tại đúng rạp đang xem (khớp kiểm quyền của API).
  const editingOverride =
    cinemaId !== null && (isAdmin || memberships.some((m) => m.cinemaId === cinemaId && m.role === "MANAGER"));

  const mutate = async (run: () => Promise<unknown>, successMessage: string) => {
    setBusy(true);
    try {
      await run();
      toast.success(successMessage);
      await load(true);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const save = (cell: CellKey, amount: number) => {
    const target = (editingChain ? chain : overrides).get(keyOf(cell));
    return mutate(
      () =>
        target
          ? apiFetch(`/price-rules/${target.id}`, { method: "PATCH", json: { amount } })
          : apiFetch("/price-rules", {
              method: "POST",
              json: { scope: editingChain ? "CHAIN" : "CINEMA", cinemaId: editingChain ? null : cinemaId, ...cell, amount },
            }),
      "Đã lưu giá. Giá mới áp dụng cho đơn giữ ghế sau thời điểm lưu.",
    );
  };

  const removeOverride = (cell: CellKey) => {
    const target = overrides.get(keyOf(cell));
    if (!target) return Promise.resolve();
    return mutate(() => apiFetch(`/price-rules/${target.id}`, { method: "DELETE" }), "Đã xoá ghi đè, ô quay về giá chuỗi.");
  };

  if (status === "loading") return <LoadingState label="Đang tải bảng giá…" />;
  if (status === "error") return <ErrorState onRetry={() => void load()} />;
  if (chain.size === 0 && !editingChain) {
    return <EmptyState title="Chưa có bảng giá chuỗi" description="Admin cần thiết lập giá mặc định toàn chuỗi trước." />;
  }

  return (
    <section className="space-y-3" aria-labelledby="price-matrix-title">
      <div>
        <h2 id="price-matrix-title" className="text-h3 font-bold">
          {editingChain ? "Bảng giá mặc định toàn chuỗi" : `Giá tại ${cinemaName}`}
        </h2>
        <p className="text-body-sm text-fg-secondary">
          Đơn vị: VND. Ưu tiên: ghi đè suất › ghi đè rạp › mặc định chuỗi; loại ngày: ngày lễ › cuối tuần › ngày thường.
          Sweetbox: giá theo cặp.
        </p>
        {editingChain || editingOverride ? null : (
          <p className="text-body-sm text-fg-muted">
            Bạn chỉ có quyền xem. Giá chuỗi do Admin sửa; ghi đè giá rạp do Quản lý rạp sửa.
          </p>
        )}
      </div>
      <div className="overflow-x-auto border border-border-subtle">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead rowSpan={2}>Ghế • Định dạng</TableHead>
              {DAY_TYPES.map((d) => (
                <TableHead key={d} colSpan={2} className="text-center">
                  {DAY_LABEL[d]}
                </TableHead>
              ))}
            </TableRow>
            <TableRow>
              {DAY_TYPES.flatMap((d) =>
                TIME_BANDS.map((b) => <TableHead key={`${d}-${b}`}>{BAND_LABEL[b]}</TableHead>),
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {SEAT_TYPES.flatMap((seatType) =>
              FORMATS.map((format) => (
                <TableRow key={`${seatType}-${format}`}>
                  <TableCell className="font-semibold">
                    {SEAT_LABEL[seatType]} {format}
                  </TableCell>
                  {DAY_TYPES.flatMap((dayType) =>
                    TIME_BANDS.map((timeBand) => {
                      const cell: CellKey = { seatType, format, dayType, timeBand };
                      const k = keyOf(cell);
                      const override = editingChain ? undefined : overrides.get(k);
                      const base = chain.get(k);
                      const shown = override ?? base;
                      let source: "override" | "chain" | "none" = "none";
                      if (override) source = "override";
                      else if (base) source = "chain";
                      const label = `${SEAT_LABEL[seatType]} ${format} ${DAY_LABEL[dayType]} ${BAND_LABEL[timeBand]}`;
                      return (
                        <TableCell key={k}>
                          <PriceCell
                            key={`${source}:${shown?.amount ?? ""}`}
                            label={label}
                            amount={shown?.amount ?? null}
                            source={source}
                            inheritedView={!editingChain}
                            editable={editingChain || editingOverride}
                            busy={busy}
                            onSave={(amount) => void save(cell, amount)}
                            onDelete={() => void removeOverride(cell)}
                          />
                        </TableCell>
                      );
                    }),
                  )}
                </TableRow>
              )),
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

const HOLIDAY_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Ngày lễ (R-53, màn B22): Admin thêm/xoá; Manager chỉ xem. */
export function HolidayManager({ role }: Readonly<{ role: AdminRole }>) {
  const isAdmin = role === "ADMIN";
  const [holidays, setHolidays] = useState<HolidayDto[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const list = await apiFetch<HolidayDto[]>("/holidays");
      setHolidays([...list].sort((a, b) => a.holidayDate.localeCompare(b.holidayDate)));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const mutate = async (run: () => Promise<unknown>, successMessage: string): Promise<boolean> => {
    setBusy(true);
    try {
      await run();
      toast.success(successMessage);
      await load();
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (!HOLIDAY_DATE_RE.test(date) || name.trim() === "") {
      setFormError("Vui lòng chọn ngày và nhập tên ngày lễ.");
      return;
    }
    setFormError(null);
    const ok = await mutate(
      () => apiFetch("/holidays", { method: "POST", json: { holidayDate: date, name: name.trim() } }),
      "Đã thêm ngày lễ.",
    );
    if (ok) {
      setDate("");
      setName("");
    }
  };

  return (
    <section className="space-y-4">
      <p className="text-body-sm text-fg-secondary">
        Ngày lễ áp giá loại ngày &quot;lễ&quot; ở mọi rạp, ưu tiên hơn cuối tuần.
      </p>
      {isAdmin ? (
        <form onSubmit={(e) => void add(e)} className="flex flex-wrap items-end gap-3" noValidate>
          <div className="space-y-1">
            <Label htmlFor="holiday-date">Ngày</Label>
            <Input id="holiday-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="holiday-name">Tên ngày lễ</Label>
            <Input id="holiday-name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button type="submit" disabled={busy}>
            Thêm ngày lễ
          </Button>
          {formError ? (
            <p role="alert" className="w-full text-caption text-danger-text">
              {formError}
            </p>
          ) : null}
        </form>
      ) : null}
      {status === "loading" ? <LoadingState label="Đang tải ngày lễ…" rows={2} /> : null}
      {status === "error" ? <ErrorState onRetry={() => void load()} /> : null}
      {status === "ready" && holidays.length === 0 ? <EmptyState title="Chưa có ngày lễ" /> : null}
      {status === "ready" && holidays.length > 0 ? (
        <div className="overflow-x-auto border border-border-subtle">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ngày</TableHead>
                <TableHead>Tên ngày lễ</TableHead>
                {isAdmin ? <TableHead className="w-16" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {holidays.map((h) => (
                <TableRow key={h.holidayDate}>
                  <TableCell className="tabular">{h.holidayDate.split("-").reverse().join("/")}</TableCell>
                  <TableCell>{h.name}</TableCell>
                  {isAdmin ? (
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" className="shadow-none bg-transparent" size="icon" disabled={busy} aria-label={`Xoá ngày lễ ${h.name}`}>
                            <Trash2 aria-hidden="true" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Xoá ngày lễ {h.name}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Ngày này sẽ tính giá theo cuối tuần/ngày thường cho các đơn giữ ghế sau thời điểm xoá.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Huỷ</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() =>
                                void mutate(
                                  () => apiFetch(`/holidays/${h.holidayDate}`, { method: "DELETE" }),
                                  "Đã xoá ngày lễ.",
                                )
                              }
                            >
                              Xoá
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </section>
  );
}
