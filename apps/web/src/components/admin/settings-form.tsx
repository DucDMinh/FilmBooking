"use client";

import {
  APP_SETTING_KEYS,
  APP_SETTING_VALUE_SCHEMAS,
  type AppSettingDto,
  type AppSettingKey,
} from "@filmbooking/shared/schemas/admin";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api/client";

import { Field, PageHeader, TextField, useAdminMe } from "./form-utils";

interface SettingMeta {
  label: string;
  hint: string;
  multiline?: boolean;
}

const SETTING_META: Record<AppSettingKey, SettingMeta> = {
  seat_hold_minutes_web: { label: "Thời gian giữ ghế (phút)", hint: "Từ 1 đến 120 phút." },
  default_cleaning_minutes: { label: "Thời gian dọn phòng mặc định (phút)", hint: "Từ 0 đến 240 phút." },
  default_online_cutoff_minutes: {
    label: "Mốc đóng bán online trước suất mặc định (phút)",
    hint: "Từ 0 đến 1440 phút.",
  },
  no_refund_warning: { label: "Nội dung cảnh báo không hoàn tiền", hint: "Tối đa 1000 ký tự.", multiline: true },
  terms_version: { label: "Phiên bản điều khoản sử dụng", hint: "Tối đa 20 ký tự, ví dụ 1.1." },
};

const isNumericKey = (key: AppSettingKey): boolean => typeof APP_SETTING_VALUE_SCHEMAS[key].safeParse(1).data === "number";

/** Giá trị nhập -> đúng kiểu của key (số cho key số) để API không bị 400 vì sai kiểu. */
function toTypedValue(key: AppSettingKey, raw: string): number | string {
  if (!isNumericKey(key)) return raw;
  return raw.trim() === "" ? Number.NaN : Number(raw);
}

/** Chỉ các key người dùng đã sửa so với giá trị đang lưu. */
export function changedKeys(settings: readonly AppSettingDto[], draft: Record<string, string>): AppSettingKey[] {
  return APP_SETTING_KEYS.filter((key) => {
    const current = settings.find((s) => s.key === key);
    return current !== undefined && draft[key] !== undefined && draft[key] !== String(current.value);
  });
}

function toDraft(settings: readonly AppSettingDto[]): Record<string, string> {
  return Object.fromEntries(settings.map((s) => [s.key, String(s.value)]));
}

function SettingsEditor({
  settings,
  canEdit,
  onSaved,
}: Readonly<{ settings: AppSettingDto[]; canEdit: boolean; onSaved: (next: AppSettingDto[]) => void }>) {
  const [draft, setDraft] = useState<Record<string, string>>(() => toDraft(settings));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const present = APP_SETTING_KEYS.filter((key) => settings.some((s) => s.key === key));
  const dirty = changedKeys(settings, draft);

  async function save(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    const typed = new Map<AppSettingKey, number | string>();
    for (const key of dirty) {
      const value = toTypedValue(key, draft[key] ?? "");
      if (APP_SETTING_VALUE_SCHEMAS[key].safeParse(value).success) typed.set(key, value);
      else nextErrors[key] = `Giá trị không hợp lệ. ${SETTING_META[key].hint}`;
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setSaving(true);
    setErrors({});
    let latest = settings;
    for (const [key, value] of typed) {
      try {
        const saved = await apiFetch<AppSettingDto>(`/admin/settings/${key}`, { method: "PATCH", json: { value } });
        latest = latest.map((s) => (s.key === key ? saved : s));
      } catch (err) {
        nextErrors[key] = err instanceof ApiError ? err.message : "Đã có lỗi xảy ra. Vui lòng thử lại sau.";
      }
    }
    setSaving(false);
    setErrors(nextErrors);
    if (latest !== settings) onSaved(latest);
    // Key lưu thành công lấy lại giá trị server; key lỗi giữ nguyên bản nháp để người dùng sửa/thử lại.
    setDraft((prev) => ({ ...prev, ...toDraft(latest.filter((s) => typed.has(s.key as AppSettingKey) && !nextErrors[s.key])) }));
    if (Object.keys(nextErrors).length === 0) toast.success("Đã lưu cấu hình");
    else toast.error("Một số cấu hình chưa lưu được");
  }

  return (
    <form onSubmit={save} className="max-w-2xl space-y-5" noValidate>
      {present.map((key) => {
        const meta = SETTING_META[key];
        const id = `setting-${key}`;
        if (meta.multiline) {
          return (
            <Field key={key} id={id} label={meta.label} hint={meta.hint} error={errors[key]}>
              <textarea
                id={id}
                rows={4}
                value={draft[key] ?? ""}
                disabled={!canEdit}
                maxLength={1000}
                aria-invalid={errors[key] ? true : undefined}
                aria-describedby={errors[key] ? `${id}-error` : undefined}
                onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                className="w-full rounded-sm border border-input bg-surface-input px-3 py-2 text-base outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-45 md:text-body"
              />
            </Field>
          );
        }
        return (
          <TextField
            key={key}
            id={id}
            label={meta.label}
            hint={meta.hint}
            error={errors[key]}
            value={draft[key] ?? ""}
            disabled={!canEdit}
            inputMode={isNumericKey(key) ? "numeric" : "text"}
            onChange={(next) => setDraft((prev) => ({ ...prev, [key]: next }))}
          />
        );
      })}
      {canEdit ? (
        <Button type="submit" disabled={saving || dirty.length === 0}>
          {saving ? "Đang lưu..." : "Lưu thay đổi"}
        </Button>
      ) : (
        <p className="text-small text-fg-muted">Chỉ Admin được thay đổi cấu hình chuỗi.</p>
      )}
    </form>
  );
}

/** Màn 28 (phần cấu hình) — R-106: Admin sửa, Manager chỉ xem. Lỗi tải -> ErrorState, không cho ghi. */
export function SettingsAdminPage() {
  const { loading, role, failed: meFailed, retry } = useAdminMe();
  const [settings, setSettings] = useState<AppSettingDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const allowed = role === "ADMIN" || role === "MANAGER";

  const load = useCallback(() => {
    setFailed(false);
    setSettings(null);
    apiFetch<AppSettingDto[]>("/admin/settings", { cache: "no-store" })
      .then(setSettings)
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  if (loading) return <LoadingState />;
  if (meFailed) return <ErrorState onRetry={retry} />;
  if (!allowed) {
    return <EmptyState title="Không có quyền" description="Chỉ Admin hoặc Quản lý rạp được xem trang này." />;
  }

  let body;
  if (failed) body = <ErrorState onRetry={load} />;
  else if (settings === null) body = <LoadingState />;
  else if (!APP_SETTING_KEYS.some((key) => settings.some((s) => s.key === key))) {
    body = <EmptyState title="Chưa có cấu hình" description="Hệ thống chưa có cấu hình chuỗi nào." />;
  } else body = <SettingsEditor settings={settings} canEdit={role === "ADMIN"} onSaved={setSettings} />;

  return (
    <div>
      <PageHeader title="Cấu hình" description="Cấu hình toàn chuỗi: giữ ghế, cảnh báo không hoàn tiền, điều khoản." />
      {body}
    </div>
  );
}
