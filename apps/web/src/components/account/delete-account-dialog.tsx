"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api/client";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasPassword?: boolean;
}

const CONFIRMATION_PHRASE = "XOÁ TÀI KHOẢN";

/**
 * Dialog xoá tài khoản nhiều bước (design-spec §B8, R-29).
 * Bước 1: Cảnh báo mất vé + checkbox xác nhận.
 * Bước 2: Nhập cụm từ xác nhận + mật khẩu xác thực.
 * Xoá thành công → đăng xuất và điều hướng về trang chủ.
 */
export function DeleteAccountDialog({
  open,
  onOpenChange,
  hasPassword = true,
}: Readonly<DeleteAccountDialogProps>) {
  const [step, setStep] = useState<1 | 2>(1);
  const [acknowledgeLoss, setAcknowledgeLoss] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const resetState = () => {
    setStep(1);
    setAcknowledgeLoss(false);
    setConfirmText("");
    setPassword("");
    setErrorMessage(null);
    setIsDeleting(false);
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) resetState();
    onOpenChange(nextOpen);
  };

  const handleNextStep = () => {
    if (!acknowledgeLoss) return;
    setStep(2);
    setErrorMessage(null);
  };

  const handleDelete = async () => {
    setErrorMessage(null);

    if (confirmText.trim().toUpperCase() !== CONFIRMATION_PHRASE) {
      setErrorMessage(`Vui lòng nhập chính xác cụm từ "${CONFIRMATION_PHRASE}" để tiếp tục.`);
      return;
    }

    if (hasPassword && !password) {
      setErrorMessage("Vui lòng nhập mật khẩu tài khoản của bạn.");
      return;
    }

    setIsDeleting(true);

    try {
      await apiFetch<{ deleted: boolean }>("/me", {
        method: "DELETE",
        json: {
          acknowledgeTicketLoss: true,
          password: hasPassword ? password : undefined,
        },
      });

      // Đăng xuất và dọn dẹp phiên
      try {
        const supabase = createBrowserSupabase();
        await supabase.auth.signOut();
      } catch {
        // Bỏ qua lỗi client sign out nếu có
      }

      toast.success("Tài khoản của bạn đã được xoá.");
      handleClose(false);
      window.location.href = "/";
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : "Không thể xoá tài khoản. Vui lòng kiểm tra lại mật khẩu.";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md border-border-subtle bg-surface">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
              <AlertTriangle className="size-5" aria-hidden="true" />
            </span>
            <DialogTitle className="text-h3 font-bold text-fg">
              Xoá tài khoản CINEMO?
            </DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            Quy trình xoá tài khoản vĩnh viễn và ẩn danh hoá dữ liệu cá nhân.
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4 py-2">
            <div className="rounded-md border border-danger-line bg-danger-soft/60 p-4 text-body-sm text-fg">
              <p className="font-semibold text-danger">
                Hành động này mang tính vĩnh viễn và không thể khôi phục:
              </p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-body-sm text-fg-secondary">
                <li>Thông tin cá nhân (họ tên, email, số điện thoại, ảnh) sẽ bị ẩn danh hoá hoàn toàn.</li>
                <li>Lịch sử đơn hàng được lưu ẩn danh theo quy định kế toán.</li>
                <li className="font-semibold text-danger">
                  Mọi vé chưa sử dụng sẽ bị mất hiệu lực và không được hoàn tiền.
                </li>
              </ul>
            </div>

            <div className="flex items-start gap-3 pt-2">
              <Checkbox
                id="ack-ticket-loss"
                checked={acknowledgeLoss}
                onCheckedChange={(checked) => setAcknowledgeLoss(checked === true)}
              />
              <Label
                htmlFor="ack-ticket-loss"
                className="text-body-sm leading-snug font-normal text-fg"
              >
                Tôi hiểu rõ và đồng ý rằng mọi vé chưa sử dụng sẽ mất hiệu lực và không thể hoàn tiền.
              </Label>
            </div>

            <DialogFooter className="mt-4 gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                Huỷ
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={!acknowledgeLoss}
                onClick={handleNextStep}
              >
                Tiếp tục
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <p className="text-body-sm text-fg-secondary">
              Để xác nhận, vui lòng gõ chính xác{" "}
              <strong className="font-bold text-danger">{CONFIRMATION_PHRASE}</strong> vào ô bên dưới
              {hasPassword ? " cùng với mật khẩu hiện tại của bạn" : ""}.
            </p>

            {errorMessage ? (
              <div
                role="alert"
                className="rounded-md border border-danger-line bg-danger-soft p-3 text-body-sm font-medium text-danger"
              >
                {errorMessage}
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="confirm-phrase">Cụm từ xác nhận</Label>
              <Input
                id="confirm-phrase"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={CONFIRMATION_PHRASE}
                disabled={isDeleting}
                autoComplete="off"
              />
            </div>

            {hasPassword ? (
              <div className="space-y-1.5">
                <Label htmlFor="delete-password">Mật khẩu của bạn</Label>
                <Input
                  id="delete-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu để xác minh"
                  disabled={isDeleting}
                  autoComplete="current-password"
                />
              </div>
            ) : null}

            <DialogFooter className="mt-4 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                disabled={isDeleting}
                onClick={() => setStep(1)}
              >
                Quay lại
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={
                  isDeleting ||
                  confirmText.trim().toUpperCase() !== CONFIRMATION_PHRASE ||
                  (hasPassword && !password)
                }
                onClick={handleDelete}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    <span>Đang xoá…</span>
                  </>
                ) : (
                  "Xoá vĩnh viễn tài khoản"
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
