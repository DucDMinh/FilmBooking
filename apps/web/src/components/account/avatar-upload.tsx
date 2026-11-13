"use client";

import { Camera, Check, Loader2, User, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";

export interface AvatarUploadProps {
  currentAvatarUrl?: string | null;
  name?: string | null;
  onAvatarUpdated?: (newUrl: string) => void;
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB (R-28)

interface AvatarUploadInitResponse {
  path: string;
  token: string;
  signedUrl: string;
  publicUrl: string;
}

/**
 * Upload ảnh đại diện cá nhân (design-spec §15, R-28).
 * Kiểm tra định dạng JPG/PNG/WebP, dung lượng <= 2MB, xem trước trước khi lưu.
 */
export function AvatarUpload({
  currentAvatarUrl,
  name,
  onAvatarUpdated,
}: Readonly<AvatarUploadProps>) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Thu hồi Object URL khi previewUrl thay đổi hoặc khi component unmount để tránh rò rỉ bộ nhớ
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const getInitials = (fullName?: string | null): string => {
    if (!fullName) return "";
    const parts = fullName.trim().split(/\s+/);
    const first = parts[0] ?? "";
    const last = parts[parts.length - 1] ?? "";
    if (parts.length === 1) return first.slice(0, 2).toUpperCase();
    return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type) || file.size > MAX_BYTES) {
      setErrorMessage("Ảnh phải là JPG, PNG hoặc WebP, tối đa 2 MB");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setSelectedFile(file);
  };

  const handleCancelPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSelectedFile(null);
    setErrorMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSaveAvatar = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    setErrorMessage(null);

    try {
      // 1. Lấy signed upload URL từ API
      const initRes = await apiFetch<AvatarUploadInitResponse>("/me/avatar", {
        method: "POST",
        json: {
          contentType: selectedFile.type,
          sizeBytes: selectedFile.size,
        },
      });

      // 2. Tải file trực tiếp lên Supabase Storage qua signed URL
      const uploadRes = await fetch(initRes.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": selectedFile.type },
        body: selectedFile,
      });

      if (!uploadRes.ok) {
        throw new Error("Không thể tải ảnh lên kho lưu trữ");
      }

      // 3. Cập nhật URL ảnh vào profile
      await apiFetch("/me/profile", {
        method: "PATCH",
        json: { avatarUrl: initRes.publicUrl },
      });

      toast.success("Cập nhật ảnh đại diện thành công");
      onAvatarUpdated?.(initRes.publicUrl);
      handleCancelPreview();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Cập nhật ảnh đại diện thất bại";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const displayUrl = previewUrl || currentAvatarUrl;
  const initials = getInitials(name);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative size-24 shrink-0 overflow-hidden rounded-full border-2 border-border bg-surface-elevated">
        {displayUrl ? (
          <Image
            src={displayUrl}
            alt={name ? `Ảnh đại diện của ${name}` : "Ảnh đại diện"}
            fill
            sizes="96px"
            className="object-cover"
            unoptimized
          />
        ) : initials ? (
          <div className="flex size-full items-center justify-center text-h2 font-bold text-fg-secondary">
            {initials}
          </div>
        ) : (
          <div className="flex size-full items-center justify-center text-fg-muted">
            <User className="size-10" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          id="avatar-input"
          onChange={handleFileChange}
        />

        {previewUrl ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={isUploading}
              onClick={handleSaveAvatar}
            >
              {isUploading ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  <span>Đang lưu…</span>
                </>
              ) : (
                <>
                  <Check className="size-4" aria-hidden="true" />
                  <span>Lưu ảnh</span>
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isUploading}
              onClick={handleCancelPreview}
            >
              <X className="size-4" aria-hidden="true" />
              <span>Huỷ</span>
            </Button>
            <span className="text-small text-fg-muted">(Đang xem trước)</span>
          </div>
        ) : (
          <div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera className="size-4" aria-hidden="true" />
              <span>Đổi ảnh</span>
            </Button>
          </div>
        )}

        <p className="text-small text-fg-secondary">
          JPG, PNG hoặc WebP. Tối đa 2 MB.
        </p>

        {errorMessage ? (
          <p role="alert" className="text-small font-medium text-danger">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}
