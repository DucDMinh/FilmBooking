"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { signOutAction } from "@/app/auth/actions";
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
import { ApiError, apiFetch } from "@/lib/api/client";

export interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasPassword?: boolean;
}

const CONFIRMATION_PHRASE = "XOÁ TÀI KHOẢN";

function isPhraseMatch(input: string): boolean {
  const normalizedInput = input.trim().normalize("NFC").toUpperCase().replace("XÓA", "XOÁ");
  const target = CONFIRMATION_PHRASE.normalize("NFC").toUpperCase();
  return normalizedInput === target;
}

interface StepOneProps {
  acknowledgeLoss: boolean;
  onAcknowledgeChange: (checked: boolean) => void;
  onCancel: () => void;
  onNext: () => void;
}

function DeleteAccountStepOne({
  acknowledgeLoss,
  onAcknowledgeChange,
  onCancel,
  onNext,
}: Readonly<StepOneProps>) {
  return (
    <div className="space-y-4 py-2">
      <div className="rounded-md border border-danger-line bg-danger-soft/60 p-4 text-body-sm text-fg">
        <p className="font-semibold text-danger">Hành động này mang tính vĩnh viễn và không thể khôi phục:</p>
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
          onCheckedChange={(checked) => onAcknowledgeChange(checked === true)}
        />
        <Label htmlFor="ack-ticket-loss" className="text-body-sm leading-snug font-normal text-fg">
          Tôi hiểu rõ và đồng ý rằng mọi vé chưa sử dụng sẽ mất hiệu lực và không thể hoàn tiền.
        </Label>
      </div>

      <DialogFooter className="mt-4 gap-2 sm:gap-0">
        <Button type="button" variant="outline" onClick={onCancel}>
          Huỷ
        </Button>
        <Button type="button" variant="destructive" disabled={!acknowledgeLoss} onClick={onNext}>
          Tiếp tục
        </Button>
      </DialogFooter>
    </div>
  );
}

interface StepTwoProps {
  hasPassword: boolean;
  confirmText: string;
  onConfirmTextChange: (text: string) => void;
  password: string;
  onPasswordChange: (pwd: string) => void;
  errorMessage: string | null;
  isReauthRequired: boolean;
  isDeleting: boolean;
  onBack: () => void;
  onDelete: () => void;
}

function DeleteAccountStepTwo({
  hasPassword,
  confirmText,
  onConfirmTextChange,
  password,
  onPasswordChange,
  errorMessage,
  isReauthRequired,
  isDeleting,
  onBack,
  onDelete,
}: Readonly<StepTwoProps>) {
  const isDeleteDisabled =
    isDeleting || !isPhraseMatch(confirmText) || (hasPassword && !password);

  return (
    <div className="space-y-4 py-2">
      <p className="text-body-sm text-fg-secondary">
        Để xác nhận, vui lòng gõ chính xác{" "}
        <strong className="font-bold text-danger">{CONFIRMATION_PHRASE}</strong> vào ô bên dưới
        {hasPassword ? " cùng với mật khẩu hiện tại của bạn" : ""}.
      </p>

      {errorMessage ? (
        <div
          role="alert"
          className="space-y-2 rounded-md border border-danger-line bg-danger-soft p-3 text-body-sm font-medium text-danger"
        >
          <p>{errorMessage}</p>
          {isReauthRequired ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-1 border-danger-line text-danger hover:bg-danger-soft/80"
              onClick={() => {
                window.location.href = "/dang-nhap?next=/tai-khoan";
              }}
            >
              Đăng nhập lại
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="confirm-phrase">Cụm từ xác nhận</Label>
        <Input
          id="confirm-phrase"
          value={confirmText}
          onChange={(e) => onConfirmTextChange(e.target.value)}
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
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder="Nhập mật khẩu để xác minh"
            disabled={isDeleting}
            autoComplete="current-password"
          />
        </div>
      ) : null}

      <DialogFooter className="mt-4 gap-2 sm:gap-0">
        <Button type="button" variant="outline" disabled={isDeleting} onClick={onBack}>
          Quay lại
        </Button>
        <Button type="button" variant="destructive" disabled={isDeleteDisabled} onClick={onDelete}>
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
  );
}

/**
 * Dialog xoá tài khoản nhiều bước (design-spec §B8, R-29).
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
  const [isReauthRequired, setIsReauthRequired] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const resetState = () => {
    setStep(1);
    setAcknowledgeLoss(false);
    setConfirmText("");
    setPassword("");
    setErrorMessage(null);
    setIsReauthRequired(false);
    setIsDeleting(false);
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) resetState();
    onOpenChange(nextOpen);
  };

  const handleDelete = async () => {
    setErrorMessage(null);
    setIsReauthRequired(false);

    if (!isPhraseMatch(confirmText)) {
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

      // Huỷ phiên và dọn sạch cookie HttpOnly qua server action
      await signOutAction();

      toast.success("Tài khoản của bạn đã được xoá.");
      handleClose(false);
      window.location.href = "/";
    } catch (error) {
      const is403 =
        (error instanceof ApiError && (error.status === 403 || error.code === "FORBIDDEN")) ||
        (error as { status?: number })?.status === 403;

      if (is403) {
        if (hasPassword) {
          const msg = "Mật khẩu hiện tại không đúng, vui lòng kiểm tra lại.";
          setErrorMessage(msg);
          toast.error(msg);
        } else {
          const msg =
            "Phiên đăng nhập đã quá 5 phút. Vui lòng đăng nhập lại để xác thực xoá tài khoản";
          setErrorMessage(msg);
          setIsReauthRequired(true);
          toast.error(msg);
        }
      } else {
        const msg =
          error instanceof Error
            ? error.message
            : "Không thể xoá tài khoản. Vui lòng kiểm tra lại.";
        setErrorMessage(msg);
        toast.error(msg);
      }
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
            <DialogTitle className="text-h3 font-bold text-fg">Xoá tài khoản CINEMO?</DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            Quy trình xoá tài khoản vĩnh viễn và ẩn danh hoá dữ liệu cá nhân.
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <DeleteAccountStepOne
            acknowledgeLoss={acknowledgeLoss}
            onAcknowledgeChange={setAcknowledgeLoss}
            onCancel={() => handleClose(false)}
            onNext={() => {
              if (acknowledgeLoss) {
                setStep(2);
                setErrorMessage(null);
                setIsReauthRequired(false);
              }
            }}
          />
        ) : (
          <DeleteAccountStepTwo
            hasPassword={hasPassword}
            confirmText={confirmText}
            onConfirmTextChange={setConfirmText}
            password={password}
            onPasswordChange={setPassword}
            errorMessage={errorMessage}
            isReauthRequired={isReauthRequired}
            isDeleting={isDeleting}
            onBack={() => setStep(1)}
            onDelete={handleDelete}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
