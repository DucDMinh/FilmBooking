"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api/client";
import {
  CINEMA_DB_STATUSES,
  createCinemaSchema,
  updateCinemaSchema,
  type CinemaDto,
  type ProvinceDto,
} from "@filmbooking/shared/schemas/catalog";
import { updateCinemaSettingsSchema } from "@filmbooking/shared/schemas/cinema-ops";

import { CINEMA_STATUS_LABELS } from "./cinema-status-dialog";
import {
  Field,
  FormSection,
  TextField,
  emptyToNull,
  parseNumber,
  writeErrorToFields,
  splitList,
  zodFieldErrors,
  type FieldErrors,
} from "./form-utils";
import { ImageUploadField } from "./image-upload-field";
import type { AdminRole } from "./nav-config";

/** Cấu hình rạp hiện tại (GET /cinemas/:id/settings). null = dùng mặc định chuỗi. */
export interface CinemaSettings {
  cleaningMinutes: number | null;
  onlineCutoffMinutes: number | null;
  effectiveCleaningMinutes?: number;
  effectiveOnlineCutoffMinutes?: number;
}

interface CinemaFormState {
  name: string;
  code: string;
  provinceCode: string;
  district: string;
  address: string;
  hotline: string;
  email: string;
  openingHours: string;
  latitude: string;
  longitude: string;
  amenities: string;
  imageUrl: string;
  status: string;
  cleaningMinutes: string;
  onlineCutoffMinutes: string;
}

function initialState(cinema?: CinemaDto, settings?: CinemaSettings): CinemaFormState {
  const text = (value: number | null | undefined) => (value == null ? "" : String(value));
  return {
    name: cinema?.name ?? "",
    code: cinema?.code ?? "",
    provinceCode: cinema?.provinceCode ?? "",
    district: cinema?.district ?? "",
    address: cinema?.address ?? "",
    hotline: cinema?.hotline ?? "",
    email: cinema?.email ?? "",
    openingHours: cinema?.openingHours ?? "",
    latitude: text(cinema?.latitude),
    longitude: text(cinema?.longitude),
    amenities: (cinema?.amenities ?? []).join(", "),
    imageUrl: cinema?.imageUrl ?? "",
    status: cinema?.status ?? "OPEN",
    cleaningMinutes: text(settings?.cleaningMinutes),
    onlineCutoffMinutes: text(settings?.onlineCutoffMinutes),
  };
}

/** Số tuỳ chọn: rỗng -> null (dùng mặc định chuỗi / không đặt toạ độ). */
const optionalNumber = (value: string): number | null => parseNumber(value) ?? null;

function infoFields(form: CinemaFormState) {
  return {
    name: form.name,
    district: emptyToNull(form.district),
    address: form.address,
    latitude: optionalNumber(form.latitude),
    longitude: optionalNumber(form.longitude),
    hotline: emptyToNull(form.hotline),
    email: emptyToNull(form.email),
    openingHours: emptyToNull(form.openingHours),
    imageUrl: emptyToNull(form.imageUrl),
    amenities: splitList(form.amenities),
  };
}

function settingsFields(form: CinemaFormState) {
  return {
    cleaningMinutes: optionalNumber(form.cleaningMinutes),
    onlineCutoffMinutes: optionalNumber(form.onlineCutoffMinutes),
  };
}

function settingsChanged(
  loaded: CinemaSettings,
  next: { cleaningMinutes?: number | null; onlineCutoffMinutes?: number | null },
): boolean {
  return (
    (next.cleaningMinutes ?? null) !== loaded.cleaningMinutes ||
    (next.onlineCutoffMinutes ?? null) !== loaded.onlineCutoffMinutes
  );
}

/**
 * Form rạp (màn 36, R-32/R-38/R-56). Admin tạo/sửa đủ trường; Manager chỉ sửa thông tin + cấu hình rạp mình
 * (mã rạp, tỉnh/thành bị khoá; trạng thái đổi riêng qua CinemaStatusDialog có guard AC-26).
 */
export function CinemaForm({
  role,
  cinema,
  settings,
}: Readonly<{ role: AdminRole; cinema?: CinemaDto; settings?: CinemaSettings }>) {
  const router = useRouter();
  const isAdmin = role === "ADMIN";
  const [form, setForm] = useState<CinemaFormState>(() => initialState(cinema, settings));
  const [provinces, setProvinces] = useState<ProvinceDto[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    apiFetch<ProvinceDto[]>("/provinces")
      .then(setProvinces)
      .catch(() => setProvinces([]));
  }, [isAdmin]);

  const set = <K extends keyof CinemaFormState>(key: K) => (value: CinemaFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function save(): Promise<boolean> {
    if (!cinema) {
      const parsed = createCinemaSchema.safeParse({
        ...infoFields(form),
        ...settingsFields(form),
        code: form.code.trim(),
        provinceCode: form.provinceCode,
        status: form.status,
      });
      if (!parsed.success) {
        setErrors(zodFieldErrors(parsed.error));
        return false;
      }
      await apiFetch("/admin/cinemas", { method: "POST", json: parsed.data });
      return true;
    }

    const info = updateCinemaSchema.safeParse({
      ...infoFields(form),
      ...(isAdmin ? { code: form.code.trim(), provinceCode: form.provinceCode } : {}),
    });
    const settingsParsed = updateCinemaSettingsSchema.safeParse(settingsFields(form));
    if (!info.success || !settingsParsed.success) {
      setErrors({
        ...(info.success ? {} : zodFieldErrors(info.error)),
        ...(settingsParsed.success ? {} : zodFieldErrors(settingsParsed.error)),
      });
      return false;
    }
    await apiFetch(`/admin/cinemas/${cinema.id}`, { method: "PATCH", json: info.data });
    // Chỉ ghi cấu hình khi đã tải được giá trị hiện tại và người dùng thật sự đổi — tránh reset về mặc định chuỗi.
    if (settings && settingsChanged(settings, settingsParsed.data)) {
      await apiFetch(`/cinemas/${cinema.id}/settings`, { method: "PATCH", json: settingsParsed.data });
    }
    return true;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setSaving(true);
    try {
      if (await save()) {
        toast.success(cinema ? "Đã lưu rạp" : "Đã tạo rạp");
        router.push("/admin/rap");
      }
    } catch (err) {
      setErrors(writeErrorToFields(err, { field: "code", message: "Mã rạp đã tồn tại" }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {errors._form ? (
        <p role="alert" className="rounded-md border border-danger-line bg-danger-soft p-3 text-body-sm text-danger">
          {errors._form}
        </p>
      ) : null}

      <FormSection title="Thông tin cơ bản">
        <TextField id="name" label="Tên rạp" required value={form.name} onChange={set("name")} error={errors.name} />
        <TextField
          id="code"
          label="Mã rạp"
          required
          value={form.code}
          onChange={(value) => set("code")(value.toUpperCase())}
          error={errors.code}
          disabled={Boolean(cinema) && !isAdmin}
          hint="2–10 ký tự in hoa/số, duy nhất, in trên vé."
        />
        <Field id="provinceCode" label="Tỉnh/thành" required error={errors.provinceCode}>
          {isAdmin ? (
            <Select value={form.provinceCode} onValueChange={set("provinceCode")}>
              <SelectTrigger id="provinceCode" aria-label="Tỉnh/thành">
                <SelectValue placeholder="Chọn tỉnh/thành" />
              </SelectTrigger>
              <SelectContent>
                {provinces.map((province) => (
                  <SelectItem key={province.code} value={province.code}>
                    {province.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p id="provinceCode" className="text-body-sm text-fg-secondary">
              {form.provinceCode || "—"}
            </p>
          )}
        </Field>
        <TextField id="district" label="Quận/huyện" value={form.district} onChange={set("district")} error={errors.district} />
        <TextField id="address" label="Địa chỉ" required value={form.address} onChange={set("address")} error={errors.address} className="md:col-span-2" />
        <TextField id="hotline" label="Hotline" value={form.hotline} onChange={set("hotline")} error={errors.hotline} />
        <TextField id="email" label="Email" type="email" value={form.email} onChange={set("email")} error={errors.email} />
        <TextField id="openingHours" label="Giờ mở cửa" value={form.openingHours} onChange={set("openingHours")} error={errors.openingHours} hint="Ví dụ: 08:00 – 23:30" />
        {!cinema ? (
          <Field id="status" label="Trạng thái" required error={errors.status}>
            <Select value={form.status} onValueChange={set("status")}>
              <SelectTrigger id="status" aria-label="Trạng thái">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CINEMA_DB_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {CINEMA_STATUS_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : (
          <Field id="status-readonly" label="Trạng thái">
            <p id="status-readonly" className="text-body-sm text-fg-secondary">
              {CINEMA_STATUS_LABELS[cinema.status]}
              {isAdmin ? " — đổi tại danh sách rạp (Đổi trạng thái)." : ""}
            </p>
          </Field>
        )}
      </FormSection>

      <FormSection title="Bản đồ & tiện ích">
        <TextField id="latitude" label="Vĩ độ" inputMode="decimal" value={form.latitude} onChange={set("latitude")} error={errors.latitude} />
        <TextField id="longitude" label="Kinh độ" inputMode="decimal" value={form.longitude} onChange={set("longitude")} error={errors.longitude} />
        <TextField id="amenities" label="Tiện ích" value={form.amenities} onChange={set("amenities")} error={errors.amenities} hint="Ngăn cách bằng dấu phẩy: Bãi đỗ xe, Thang máy…" className="md:col-span-2" />
        <ImageUploadField id="imageUrl" label="Ảnh đại diện rạp" bucket="cinema-images" cinemaId={cinema?.id} value={form.imageUrl} onChange={set("imageUrl")} error={errors.imageUrl} previewClassName="aspect-video w-48 rounded-md border border-border-subtle object-cover" hint="JPG, PNG hoặc WebP, tối đa 5 MB" />
      </FormSection>

      <FormSection title="Cấu hình rạp">
        <TextField
          id="cleaningMinutes"
          label="Thời gian dọn phòng (phút)"
          type="number"
          inputMode="numeric"
          value={form.cleaningMinutes}
          onChange={set("cleaningMinutes")}
          error={errors.cleaningMinutes}
          hint={`Để trống = mặc định chuỗi${settings?.effectiveCleaningMinutes != null ? ` (${settings.effectiveCleaningMinutes} phút)` : ""}`}
        />
        <TextField
          id="onlineCutoffMinutes"
          label="Đóng bán online trước suất (phút)"
          type="number"
          inputMode="numeric"
          value={form.onlineCutoffMinutes}
          onChange={set("onlineCutoffMinutes")}
          error={errors.onlineCutoffMinutes}
          hint={`Để trống = mặc định chuỗi${settings?.effectiveOnlineCutoffMinutes != null ? ` (${settings.effectiveOnlineCutoffMinutes} phút)` : ""}`}
        />
      </FormSection>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Đang lưu…" : cinema ? "Lưu rạp" : "Tạo rạp"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.push("/admin/rap")}>
          Huỷ
        </Button>
      </div>
    </form>
  );
}
