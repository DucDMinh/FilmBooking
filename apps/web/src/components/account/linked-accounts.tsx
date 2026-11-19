"use client";

import type { IdentityListResponse, UnlinkProvider } from "@filmbooking/shared/schemas/identity";
import { KeyRound, Loader2, Mail } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AddPasswordForm } from "@/components/account/add-password-form";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch, ApiError } from "@/lib/api/client";

const PROVIDER_LABEL: Record<UnlinkProvider, string> = { google: "Google", facebook: "Facebook" };
const REAUTH_HREF = "/dang-nhap?next=%2Ftai-khoan%2Fbao-mat";

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
    </svg>
  );
}

/** Khởi tạo liên kết phía server (cookie phiên là HttpOnly nên trình duyệt không gọi GoTrue được). */
export type LinkIdentityAction = (
  provider: UnlinkProvider,
) => Promise<{ url?: string; error?: string }>;

/** Mã lỗi callback -> thông báo (R-23, AC-04). Không lộ thông tin tài khoản khác. */
function callbackErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  if (
    code === "identity_already_exists" ||
    code === "OAUTH_IDENTITY_TAKEN" ||
    code === "identity_taken"
  ) {
    return "Tài khoản mạng xã hội này đã liên kết với một tài khoản CINEMO khác.";
  }
  return "Không thể liên kết tài khoản. Nếu email này đã có tài khoản đăng nhập bằng mật khẩu, hãy đăng nhập bằng mật khẩu rồi liên kết tại đây.";
}

export interface LinkedAccountsProps {
  linkIdentity: LinkIdentityAction;
  /** Mã lỗi từ callback OAuth (query `error`), nếu có. */
  callbackError?: string | null;
  /** Mặc định `window.location.assign`; tiêm được để test. */
  navigate?: (url: string) => void;
}

export function LinkedAccounts({
  linkIdentity,
  callbackError = null,
  navigate = (url) => window.location.assign(url),
}: Readonly<LinkedAccountsProps>) {
  const [data, setData] = useState<IdentityListResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(callbackErrorMessage(callbackError));
  const [needReauth, setNeedReauth] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<UnlinkProvider | null>(null);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<IdentityListResponse>("/me/identities"));
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function startLink(provider: UnlinkProvider) {
    setNotice(null);
    setNeedReauth(false);
    setBusy(provider);
    try {
      // Bước 1: đăng ký ý định liên kết (API kiểm tra đăng nhập gần đây). Chỉ khi 204 mới gọi GoTrue.
      await apiFetch("/me/identities/link-intent", { method: "POST", json: { provider } });
    } catch (err) {
      if (err instanceof ApiError && err.code === "REAUTH_REQUIRED") setNeedReauth(true);
      else setNotice(err instanceof ApiError ? err.message : "Không thể bắt đầu liên kết. Vui lòng thử lại.");
      setBusy(null);
      return;
    }
    try {
      const result = await linkIdentity(provider);
      if (result.url) {
        navigate(result.url);
        return;
      }
      setNotice(result.error ?? "Không thể liên kết tài khoản. Vui lòng thử lại.");
    } catch {
      setNotice("Không thể liên kết tài khoản. Vui lòng thử lại.");
    }
    setBusy(null);
  }

  function requestUnlink(provider: UnlinkProvider) {
    if (data && !data.canUnlink) setBlockedOpen(true);
    else setUnlinkTarget(provider);
  }

  async function confirmUnlink() {
    const provider = unlinkTarget;
    if (!provider) return;
    setBusy(provider);
    try {
      await apiFetch(`/me/identities/${provider}`, { method: "DELETE" });
      setUnlinkTarget(null);
      await load();
    } catch (err) {
      setUnlinkTarget(null);
      setNotice(err instanceof ApiError ? err.message : "Không thể huỷ liên kết. Vui lòng thử lại.");
    } finally {
      setBusy(null);
    }
  }

  if (loadError) {
    return (
      <div role="alert" className="border border-danger-line bg-danger-soft p-4 text-body-sm">
        Không tải được danh sách phương thức đăng nhập.{" "}
        <Button variant="link" onClick={() => void load()}>
          Thử lại
        </Button>
      </div>
    );
  }
  if (!data) {
    return (
      <p role="status" className="flex items-center gap-2 text-body-sm text-fg-secondary">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Đang tải…
      </p>
    );
  }

  const emailIdentity = data.identities.find((i) => i.provider === "email");
  const linked = (p: UnlinkProvider) => data.identities.find((i) => i.provider === p);

  return (
    <section aria-labelledby="linked-title" className="flex flex-col gap-4">
      <h2 id="linked-title" className="text-h3 font-bold">
        Bảo mật &amp; phương thức đăng nhập
      </h2>

      {notice ? (
        <p role="alert" className="border border-danger-line bg-danger-soft p-3 text-body-sm">
          {notice}
        </p>
      ) : null}
      {needReauth ? (
        <div role="alert" className="border border-border bg-surface-elevated p-3 text-body-sm">
          Để liên kết tài khoản, bạn cần đăng nhập lại.{" "}
          <Link href={REAUTH_HREF} className="font-semibold text-link underline">
            Đăng nhập lại
          </Link>{" "}
          rồi thử liên kết lần nữa.
        </div>
      ) : null}

      <ul className="divide-y divide-border-subtle border border-border bg-surface">
        <li className="flex min-h-16 flex-wrap items-center gap-3 p-4">
          <Mail className="size-5 text-fg-muted" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Email &amp; mật khẩu</p>
            <p className="truncate text-small text-fg-secondary">
              {data.hasPassword ? (emailIdentity?.email ?? "Đã thiết lập mật khẩu") : "Chưa đặt mật khẩu"}
            </p>
          </div>
          {data.hasPassword ? null : (
            <Button variant="secondary" size="sm" onClick={() => setPasswordOpen(true)}>
              <KeyRound aria-hidden="true" /> Đặt mật khẩu
            </Button>
          )}
        </li>
        {(["google", "facebook"] as const).map((provider) => {
          const identity = linked(provider);
          const label = PROVIDER_LABEL[provider];
          return (
            <li key={provider} className="flex min-h-16 flex-wrap items-center gap-3 p-4">
              {provider === "facebook" ? (
                <FacebookIcon className="size-5 text-fg-muted" />
              ) : (
                <GoogleIcon className="size-5 text-fg-muted" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{label}</p>
                <p className="truncate text-small text-fg-secondary">
                  {identity ? (identity.email ?? "Đã liên kết") : "Chưa liên kết"}
                </p>
              </div>
              {identity ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy !== null}
                  aria-label={`Huỷ liên kết ${label}`}
                  onClick={() => requestUnlink(provider)}
                >
                  Huỷ liên kết
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy !== null}
                  aria-label={`Liên kết ${label}`}
                  onClick={() => void startLink(provider)}
                >
                  {busy === provider ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                  Liên kết
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đặt mật khẩu</DialogTitle>
            <DialogDescription>Thêm mật khẩu để đăng nhập bằng email ngoài Google/Facebook.</DialogDescription>
          </DialogHeader>
          <AddPasswordForm
            onSuccess={() => {
              setPasswordOpen(false);
              void load();
            }}
          />
        </DialogContent>
      </Dialog>

      <AlertDialog open={blockedOpen} onOpenChange={setBlockedOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Không thể huỷ liên kết</AlertDialogTitle>
            <AlertDialogDescription>
              Không thể huỷ liên kết phương thức đăng nhập cuối cùng. Hãy thêm phương thức khác (ví dụ đặt mật khẩu)
              trước.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Đã hiểu</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={unlinkTarget !== null} onOpenChange={(o) => (o ? null : setUnlinkTarget(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Huỷ liên kết {unlinkTarget ? PROVIDER_LABEL[unlinkTarget] : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn sẽ không đăng nhập bằng phương thức này được nữa. Có thể liên kết lại bất cứ lúc nào.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Giữ lại</AlertDialogCancel>
            <Button variant="destructive" onClick={() => void confirmUnlink()} disabled={busy !== null}>
              Xác nhận huỷ liên kết
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
