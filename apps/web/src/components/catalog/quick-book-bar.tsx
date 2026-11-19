"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import type { CinemaDto, ProvinceDto } from "@filmbooking/shared/schemas/catalog";

import { ProvincePickerDialog } from "@/components/catalog/province-picker-dialog";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import {
  EMPTY_SELECTION,
  applyFieldChange,
  dateOptions,
  loadCinemaShowtimes,
  missingFieldsMessage,
  movieOptions,
  resolveSelection,
  sellableShowtimes,
  timeOptions,
  type QuickBookField,
  type QuickBookOption,
  type QuickBookShowtime,
} from "@/lib/quick-book";

export interface QuickBookBarProps {
  /** Rạp đang hoạt động của tỉnh đang chọn (trang chủ đã tải sẵn). */
  cinemas: ReadonlyArray<Pick<CinemaDto, "code" | "name" | "status">>;
  provinces: ProvinceDto[];
  /** Mã tỉnh đang chọn; thiếu thì thanh mở hộp chọn tỉnh thay vì liệt kê rạp (R-138, R-35). */
  provinceCode?: string;
}

interface FieldProps {
  id: string;
  index: number;
  label: string;
  placeholder: string;
  value: string;
  options: QuickBookOption[];
  /** true khi ô đã có đủ điều kiện để liệt kê mà không còn lựa chọn nào: hiện "Chưa có suất". */
  showEmptyNotice: boolean;
  describedBy?: string;
  invalid: boolean;
  onChange: (value: string) => void;
  /**
   * Có giá trị khi chưa chọn tỉnh: thao tác CHỦ ĐỘNG (click, Enter/Space/mũi tên) mở hộp chọn tỉnh thay vì danh sách gốc.
   * Không mở khi chỉ focus (Tab), để người dùng bàn phím đi qua được thanh.
   */
  onBlocked?: (trigger: HTMLElement) => void;
}

const OPEN_KEYS = new Set(["Enter", " ", "ArrowDown", "ArrowUp"]);

function QuickField({
  id,
  index,
  label,
  placeholder,
  value,
  options,
  showEmptyNotice,
  describedBy,
  invalid,
  onChange,
  onBlocked,
}: Readonly<FieldProps>) {
  return (
    <div className="qfield" style={{ "--i": index } as CSSProperties}>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.value)}
        onMouseDown={(event) => {
          if (!onBlocked) return;
          event.preventDefault();
          onBlocked(event.currentTarget);
        }}
        onKeyDown={(event: KeyboardEvent<HTMLSelectElement>) => {
          if (!onBlocked || !OPEN_KEYS.has(event.key)) return;
          event.preventDefault();
          onBlocked(event.currentTarget);
        }}
      >
        <option value="">{showEmptyNotice ? "Chưa có suất" : placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="qfield__caret" aria-hidden="true" />
    </div>
  );
}

export function QuickBookBar({ cinemas, provinces, provinceCode }: Readonly<QuickBookBarProps>) {
  const router = useRouter();
  const baseId = useId();
  const errorId = `${baseId}-error`;
  const [selection, setSelection] = useState(EMPTY_SELECTION);
  const [showtimes, setShowtimes] = useState<QuickBookShowtime[]>([]);
  const [loadedAt, setLoadedAt] = useState<Date>(() => new Date());
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const latestRequest = useRef(0);
  /** Phần tử đã mở hộp chọn tỉnh: đóng hộp thì trả focus về đó (Radix không có trigger để trả). */
  const pickerTrigger = useRef<HTMLElement | null>(null);

  const hasProvince = Boolean(provinceCode);
  const openCinemas = hasProvince ? cinemas.filter((cinema) => cinema.status === "OPEN") : [];

  // Chọn rạp -> tải suất 7 ngày của rạp đó bằng đúng nguồn lịch chiếu R-44; bỏ kết quả của lần gọi cũ.
  useEffect(() => {
    if (!selection.cinema) return;
    const requestId = ++latestRequest.current;
    const now = new Date();
    setLoading(true);
    loadCinemaShowtimes(selection.cinema, now, (path) => apiFetch<unknown>(path))
      .then((loaded) => {
        if (latestRequest.current !== requestId) return;
        setShowtimes(loaded);
        setLoadedAt(now);
      })
      .finally(() => {
        if (latestRequest.current === requestId) setLoading(false);
      });
  }, [selection.cinema]);

  const sellable = selection.cinema ? sellableShowtimes(showtimes, loadedAt) : [];
  const movies = movieOptions(sellable);
  const dates = dateOptions(sellable, selection.movie, loadedAt);
  const times = timeOptions(sellable, selection.movie, selection.date);
  const cinemaOptions: QuickBookOption[] = openCinemas.map((cinema) => ({ value: cinema.code, label: cinema.name }));

  const openProvincePicker = (trigger?: HTMLElement) => {
    pickerTrigger.current = trigger ?? (document.activeElement as HTMLElement | null);
    setPickerOpen(true);
  };

  function handlePickerOpenChange(open: boolean) {
    setPickerOpen(open);
    if (open) return;
    // Sau khi Radix gỡ focus scope của hộp thoại.
    const trigger = pickerTrigger.current;
    setTimeout(() => trigger?.focus(), 0);
  }

  /** Đặt chuỗi lỗi; lỗi lặp y hệt được xoá rồi gán lại để vùng live đọc lại. */
  function announceError(message: string) {
    setErrorText("");
    requestAnimationFrame(() => setErrorText(message));
  }

  function change(field: QuickBookField, value: string) {
    setErrorText("");
    if (field === "cinema") setShowtimes([]);
    setSelection((current) => applyFieldChange(current, field, value));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasProvince) {
      openProvincePicker();
      return;
    }
    const result = resolveSelection(selection);
    if (!result.ok) {
      announceError(missingFieldsMessage(result.missing));
      return;
    }
    setErrorText("");
    router.push(result.href);
  }

  const cinemaChosen = Boolean(selection.cinema);
  const describedBy = errorText ? errorId : undefined;
  const rows: Array<Omit<FieldProps, "id" | "index" | "describedBy" | "onBlocked"> & { field: QuickBookField }> = [
    {
      field: "cinema",
      label: "Rạp",
      placeholder: "Chọn rạp",
      value: selection.cinema,
      options: cinemaOptions,
      showEmptyNotice: hasProvince && cinemaOptions.length === 0,
      invalid: Boolean(errorText) && !selection.cinema,
      onChange: (value) => change("cinema", value),
    },
    {
      field: "movie",
      label: "Phim",
      placeholder: loading ? "Đang tải..." : "Chọn phim",
      value: selection.movie,
      options: movies,
      showEmptyNotice: cinemaChosen && !loading && movies.length === 0,
      invalid: Boolean(errorText) && !selection.movie,
      onChange: (value) => change("movie", value),
    },
    {
      field: "date",
      label: "Ngày",
      placeholder: "Chọn ngày",
      value: selection.date,
      options: dates,
      showEmptyNotice: Boolean(selection.movie) && dates.length === 0,
      invalid: Boolean(errorText) && !selection.date,
      onChange: (value) => change("date", value),
    },
    {
      field: "showtimeId",
      label: "Giờ chiếu",
      placeholder: "Chọn giờ",
      value: selection.showtimeId,
      options: times,
      showEmptyNotice: Boolean(selection.date) && times.length === 0,
      invalid: Boolean(errorText) && !selection.showtimeId,
      onChange: (value) => change("showtimeId", value),
    },
  ];

  return (
    <div className="qbar" aria-label="Đặt vé nhanh">
      <form className="qbar__frame" noValidate onSubmit={handleSubmit} data-testid="quick-book-bar">
        <div className="qbar__in">
          {rows.map(({ field, ...row }, index) => (
            <QuickField
              key={field}
              id={`${baseId}-${field}`}
              index={index}
              describedBy={describedBy}
              onBlocked={hasProvince ? undefined : openProvincePicker}
              {...row}
            />
          ))}
          <div className="qbar__cta" style={{ "--i": 4 } as CSSProperties}>
            <Button type="submit" size="lg">
              Đặt vé
            </Button>
          </div>
          <span className="qbar__sweep" aria-hidden="true" />
        </div>
      </form>
      <p id={errorId} role="status" aria-live="polite" className="qbar__error hud hud-danger text-danger-text">
        {errorText}
      </p>
      {hasProvince ? null : (
        <ProvincePickerDialog provinces={provinces} open={pickerOpen} onOpenChange={handlePickerOpenChange} />
      )}
    </div>
  );
}
