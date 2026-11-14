"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api/client";
import {
  UPLOAD_CONTENT_TYPES,
  UPLOAD_MAX_BYTES,
  type UploadBucket,
  type UploadTicketDto,
} from "@filmbooking/shared/schemas/catalog";

import { Field } from "./form-utils";

type AllowedType = (typeof UPLOAD_CONTENT_TYPES)[number];

const isAllowedType = (type: string): type is AllowedType => (UPLOAD_CONTENT_TYPES as readonly string[]).includes(type);

/** Kiểm tra phía client trước khi xin URL (API vẫn kiểm lại bằng zod). Trả thông điệp lỗi hoặc null. */
export function validateImageFile(file: Pick<File, "type" | "size">): string | null {
  if (!isAllowedType(file.type)) return "Chỉ chấp nhận ảnh JPG, PNG hoặc WebP.";
  if (file.size > UPLOAD_MAX_BYTES) return "Ảnh quá lớn (tối đa 5 MB).";
  return null;
}

/** Xin signed upload URL từ API rồi PUT file lên Storage (cùng định dạng supabase-js `uploadToSignedUrl`). Trả URL công khai. */
export async function uploadImage(file: File, bucket: UploadBucket, cinemaId?: string): Promise<string> {
  if (!isAllowedType(file.type)) throw new Error("Chỉ chấp nhận ảnh JPG, PNG hoặc WebP.");
  const ticket = await apiFetch<UploadTicketDto>("/admin/uploads", {
    method: "POST",
    json: { bucket, cinemaId, contentType: file.type, sizeBytes: file.size },
  });
  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("", file);
  let response: Response;
  try {
    response = await fetch(ticket.signedUrl, { method: "PUT", body });
  } catch {
    throw new Error("Không tải được ảnh lên. Vui lòng kiểm tra mạng và thử lại.");
  }
  if (!response.ok) throw new Error("Không tải được ảnh lên. Vui lòng thử lại.");
  return ticket.publicUrl;
}

/** Ô upload ảnh có xem trước, thay/xoá và báo lỗi định dạng/dung lượng (màn 36/37). */
export function ImageUploadField({
  id,
  label,
  bucket,
  cinemaId,
  value,
  onChange,
  error,
  previewClassName,
  hint,
}: Readonly<{
  id: string;
  label: string;
  bucket: UploadBucket;
  cinemaId?: string;
  value: string;
  onChange: (url: string) => void;
  error?: string;
  previewClassName: string;
  hint?: string;
}>) {
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string>();

  async function onPick(file: File | undefined) {
    if (!file) return;
    const invalid = validateImageFile(file);
    if (invalid) {
      setLocalError(invalid);
      return;
    }
    setLocalError(undefined);
    setBusy(true);
    try {
      onChange(await uploadImage(file, bucket, cinemaId));
    } catch (err) {
      setLocalError(err instanceof ApiError || err instanceof Error ? err.message : "Không tải được ảnh lên.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Field id={id} label={label} error={localError ?? error} hint={hint}>
      <div className="flex flex-wrap items-center gap-3">
        {value ? <img src={value} alt={`Xem trước ${label}`} className={previewClassName} /> : null}
        <input
          id={id}
          type="file"
          accept={UPLOAD_CONTENT_TYPES.join(",")}
          aria-label={label}
          disabled={busy}
          onChange={(event) => {
            void onPick(event.target.files?.[0]);
            event.target.value = "";
          }}
          className="max-w-full text-body-sm"
        />
        {busy ? <span className="text-small text-fg-muted">Đang tải lên…</span> : null}
        {value && !busy ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")} aria-label={`Xoá ${label}`}>
            Xoá
          </Button>
        ) : null}
      </div>
    </Field>
  );
}
