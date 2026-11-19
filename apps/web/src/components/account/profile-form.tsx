"use client";

import { AlertTriangle, Check, Loader2, Mail } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AvatarUpload } from "@/components/account/avatar-upload";
import { ChangeEmailDialog } from "@/components/account/change-email-dialog";
import { DeleteAccountDialog } from "@/components/account/delete-account-dialog";
import { HUD_LABEL } from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export interface ProfileData {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  date_of_birth: string | null;
  gender: "MALE" | "FEMALE" | "OTHER" | null;
  avatar_url: string | null;
  marketing_opt_in?: boolean;
}

export interface ProfileFormProps {
  initialProfile: ProfileData;
  hasPassword?: boolean;
}

const VN_PHONE = /^(?:0|\+84)[35789]\d{8}$/;

/**
 * Form xem và cập nhật hồ sơ cá nhân (design-spec §15, R-26, R-27, R-28, R-29).
 */
export function ProfileForm({ initialProfile, hasPassword = true }: Readonly<ProfileFormProps>) {
  const [fullName, setFullName] = useState(initialProfile.full_name ?? "");
  const [phone, setPhone] = useState(initialProfile.phone ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(initialProfile.date_of_birth ?? "");
  const [gender, setGender] = useState<string>(initialProfile.gender ?? "NONE");
  const [avatarUrl, setAvatarUrl] = useState(initialProfile.avatar_url);

  const [isSaving, setIsSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Dialog đổi email
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);

  // Dialog xoá tài khoản
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    const trimmedName = fullName.trim();
    if (!trimmedName) errors.fullName = "Họ và tên không được để trống";
    else if (trimmedName.length > 100) errors.fullName = "Họ và tên tối đa 100 ký tự";

    const trimmedPhone = phone.trim();
    if (trimmedPhone && !VN_PHONE.test(trimmedPhone)) {
      errors.phone = "Số điện thoại không hợp lệ (10 số, đầu số 03/05/07/08/09 hoặc +84)";
    }

    if (dateOfBirth) {
      const today = new Date().toISOString().slice(0, 10);
      if (dateOfBirth > today) errors.dateOfBirth = "Ngày sinh không được ở tương lai";
      else if (dateOfBirth < "1900-01-01") errors.dateOfBirth = "Ngày sinh không hợp lệ";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSaving(true);

    try {
      await apiFetch("/me/profile", {
        method: "PATCH",
        json: {
          fullName: fullName.trim(),
          phone: phone.trim() ? phone.trim() : null,
          dateOfBirth: dateOfBirth || null,
          gender: gender === "NONE" ? null : gender,
        },
      });

      toast.success("Cập nhật thông tin cá nhân thành công");
      setFieldErrors({});
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Không thể cập nhật hồ sơ";
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Khối Thông tin cá nhân */}
      <Card className="border-border bg-surface">
        <CardHeader>
          <CardTitle>Thông tin cá nhân</CardTitle>
          <CardDescription>
            Quản lý thông tin tài khoản và hình ảnh hiển thị trên CINEMO.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Avatar Upload */}
          <div className="border-b border-border pb-6">
            <Label className={cn(HUD_LABEL, "mb-3 block")}>Ảnh đại diện</Label>
            <AvatarUpload
              currentAvatarUrl={avatarUrl}
              name={fullName || initialProfile.email}
              onAvatarUpdated={(url) => setAvatarUrl(url)}
            />
          </div>

          <form onSubmit={handleSaveProfile} className="mt-6 space-y-5">
            {/* Họ và tên */}
            <div className="space-y-1.5">
              <Label htmlFor="full-name" className={HUD_LABEL}>
                Họ và tên <span className="text-danger-text">*</span>
              </Label>
              <Input
                id="full-name"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  if (fieldErrors.fullName) setFieldErrors((prev) => ({ ...prev, fullName: "" }));
                }}
                disabled={isSaving}
                aria-invalid={Boolean(fieldErrors.fullName)}
                placeholder="Nhập họ và tên của bạn"
              />
              {fieldErrors.fullName ? (
                <p role="alert" className="text-small text-danger-text">
                  {fieldErrors.fullName}
                </p>
              ) : null}
            </div>

            {/* Email (read-only + nút đổi email) */}
            <div className="space-y-1.5">
              <Label htmlFor="profile-email" className={HUD_LABEL}>Địa chỉ Email</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="profile-email"
                  value={initialProfile.email ?? ""}
                  disabled
                  className="bg-surface-elevated text-fg-secondary opacity-80"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEmailDialogOpen(true)}
                  className="shrink-0"
                >
                  <Mail className="size-4" aria-hidden="true" />
                  <span>Đổi email</span>
                </Button>
              </div>
              <p className="text-small text-fg-muted">
                Email dùng để đăng nhập và nhận thông tin vé xem phim.
              </p>
            </div>

            {/* Số điện thoại */}
            <div className="space-y-1.5">
              <Label htmlFor="phone" className={HUD_LABEL}>Số điện thoại</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (fieldErrors.phone) setFieldErrors((prev) => ({ ...prev, phone: "" }));
                }}
                disabled={isSaving}
                aria-invalid={Boolean(fieldErrors.phone)}
                placeholder="0912345678"
              />
              {fieldErrors.phone ? (
                <p role="alert" className="text-small text-danger-text">
                  {fieldErrors.phone}
                </p>
              ) : (
                <p className="text-small text-fg-muted">
                  Dùng để liên hệ trong các trường hợp hỗ trợ đặt vé hoặc thay đổi suất chiếu.
                </p>
              )}
            </div>

            {/* Ngày sinh & Giới tính */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="date-of-birth" className={HUD_LABEL}>Ngày sinh</Label>
                <Input
                  id="date-of-birth"
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => {
                    setDateOfBirth(e.target.value);
                    if (fieldErrors.dateOfBirth) setFieldErrors((prev) => ({ ...prev, dateOfBirth: "" }));
                  }}
                  disabled={isSaving}
                  aria-invalid={Boolean(fieldErrors.dateOfBirth)}
                />
                {fieldErrors.dateOfBirth ? (
                  <p role="alert" className="text-small text-danger-text">
                    {fieldErrors.dateOfBirth}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="gender-select" className={HUD_LABEL}>Giới tính</Label>
                <Select value={gender} onValueChange={(val) => setGender(val)} disabled={isSaving}>
                  <SelectTrigger id="gender-select">
                    <SelectValue placeholder="Chọn giới tính" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="MALE">Nam</SelectItem>
                    <SelectItem value="FEMALE">Nữ</SelectItem>
                    <SelectItem value="OTHER">Khác</SelectItem>
                    <SelectItem value="NONE">Không muốn nêu</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="pt-2">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    <span>Đang lưu thay đổi…</span>
                  </>
                ) : (
                  <>
                    <Check className="size-4" aria-hidden="true" />
                    <span>Lưu thay đổi</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Vùng nguy hiểm */}
      <Card className="border-danger-line/60 bg-danger-soft/20">
        <CardHeader>
          <div className="flex items-center gap-2 text-danger-text">
            <AlertTriangle className="size-5" aria-hidden="true" />
            <CardTitle className="text-danger-text">Vùng nguy hiểm</CardTitle>
          </div>
          <CardDescription className="text-fg-secondary">
            Xoá vĩnh viễn tài khoản CINEMO của bạn và ẩn danh hoá dữ liệu cá nhân theo quy định bảo vệ dữ liệu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="destructive"
            onClick={() => setDeleteDialogOpen(true)}
          >
            Xoá tài khoản
          </Button>
        </CardContent>
      </Card>

      {/* Dialog Đổi Email */}
      <ChangeEmailDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        currentEmail={initialProfile.email}
      />

      {/* Dialog Xoá tài khoản */}
      <DeleteAccountDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        hasPassword={hasPassword}
      />
    </div>
  );
}
