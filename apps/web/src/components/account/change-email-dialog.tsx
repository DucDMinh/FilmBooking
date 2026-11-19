"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { HUD_LABEL } from "@/components/auth/auth-ui";

import { Button } from "@/components/ui/button";
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

export interface ChangeEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentEmail?: string | null;
}

/**
 * Dialog đổi địa chỉ email tài khoản (design-spec §15, R-27).
 * Gửi email xác nhận kèm token, chỉ đổi sau khi người dùng click xác nhận.
 */
export function ChangeEmailDialog({
  open,
  onOpenChange,
  currentEmail,
}: Readonly<ChangeEmailDialogProps>) {
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setNewEmail("");
      setEmailError(null);
    }
    onOpenChange(nextOpen);
  };

  const handleChangeEmail = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setEmailError(null);

    const emailTrimmed = newEmail.trim().toLowerCase();
    if (!emailTrimmed) {
      setEmailError("Vui lòng nhập địa chỉ email mới");
      return;
    }
    if (emailTrimmed === currentEmail?.toLowerCase()) {
      setEmailError("Email mới trùng với email hiện tại");
      return;
    }

    setIsSendingEmail(true);

    try {
      await apiFetch<{ pendingEmail: string }>("/me/email", {
        method: "POST",
        json: { newEmail: emailTrimmed },
      });

      toast.success(`Đã gửi liên kết xác nhận tới ${emailTrimmed}. Email chỉ đổi sau khi xác nhận.`);
      handleClose(false);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Không thể yêu cầu đổi email";
      setEmailError(msg);
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md border-border bg-surface">
        <form onSubmit={handleChangeEmail}>
          <DialogHeader>
            <DialogTitle>Đổi địa chỉ email</DialogTitle>
            <DialogDescription>
              Nhập địa chỉ email mới. Chúng tôi sẽ gửi liên kết xác nhận tới email này. Email chỉ đổi sau khi bạn xác nhận.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            {emailError ? (
              <div
                role="alert"
                className="border border-danger-line bg-danger-soft p-3 text-body-sm font-medium text-danger-text"
              >
                {emailError}
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="new-email" className={HUD_LABEL}>Địa chỉ email mới</Label>
              <Input
                id="new-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="vidu@domain.com"
                disabled={isSendingEmail}
                autoComplete="email"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={isSendingEmail}
              onClick={() => handleClose(false)}
            >
              Huỷ
            </Button>
            <Button type="submit" disabled={isSendingEmail || !newEmail.trim()}>
              {isSendingEmail ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  <span>Đang gửi…</span>
                </>
              ) : (
                "Gửi liên kết xác nhận"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
