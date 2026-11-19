"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { CheckCircle2, Mail, XCircle } from "lucide-react";
import { ResendConfirmButton } from "@/components/auth/resend-confirm-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sanitizeNext } from "@/lib/auth/safe-next";

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const initialEmail = searchParams.get("email") ?? "";
  const status = searchParams.get("status");
  const next = sanitizeNext(searchParams.get("next")) ?? "/";

  const [inputEmail, setInputEmail] = useState(initialEmail);

  // Biến thể B3: Thành công
  if (status === "success") {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex size-14 items-center justify-center chamfer-md bg-success-soft text-success">
          <CheckCircle2 className="size-8" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-fg">Email đã được xác nhận</h1>
          <p className="text-body-sm text-fg-muted">
            Tài khoản của bạn đã được kích hoạt thành công. Giờ đây bạn có thể đặt vé tại mọi rạp trong chuỗi CINEMO.
          </p>
        </div>
        <Button asChild variant="gradient" className="w-full">
          <Link href={next}>Tiếp tục đặt vé</Link>
        </Button>
      </div>
    );
  }

  // Biến thể B3: Hết hạn / Đã dùng / Lỗi
  if (status === "expired" || status === "error") {
    return (
      <div className="space-y-6 text-center">
        <div className="mx-auto flex size-14 items-center justify-center chamfer-md bg-danger-soft text-danger-text">
          <XCircle className="size-8" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-fg">Liên kết đã hết hạn hoặc đã được sử dụng</h1>
          <p className="text-body-sm text-fg-muted">
            Liên kết xác nhận email chỉ có hiệu lực trong 24 giờ và chỉ dùng được một lần. Vui lòng yêu cầu gửi lại email xác nhận mới.
          </p>
        </div>

        <div className="space-y-3 text-left">
          <Label htmlFor="resend-email" className="text-body-sm font-medium text-fg">
            Nhập email của bạn
          </Label>
          <Input
            id="resend-email"
            type="email"
            autoComplete="email"
            value={inputEmail}
            onChange={(e) => setInputEmail(e.target.value)}
            placeholder="example@cinemo.vn"
          />
          <ResendConfirmButton email={inputEmail} className="w-full" />
        </div>

        <p className="text-body-sm text-fg-muted">
          <Link href="/dang-nhap" className="text-link font-medium hover:underline underline-offset-4">
            Quay lại đăng nhập
          </Link>
        </p>
      </div>
    );
  }

  // Màn 14: Sau đăng ký -> Kiểm tra hộp thư
  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex size-14 items-center justify-center chamfer-md bg-brand-soft text-brand">
        <Mail className="size-8" aria-hidden="true" />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-fg">Kiểm tra hộp thư của bạn</h1>
        <p className="text-body-sm text-fg-muted">
          Chúng tôi đã gửi liên kết xác nhận đến{" "}
          {initialEmail ? (
            <span className="font-semibold text-fg">{initialEmail}</span>
          ) : (
            "địa chỉ email của bạn"
          )}
          .
        </p>
        <p className="text-small text-fg-muted">
          Liên kết có hiệu lực trong 24 giờ. Vui lòng mở email và bấm vào liên kết để kích hoạt tài khoản.
        </p>
      </div>

      <div className="space-y-3">
        <Button asChild variant="secondary" className="w-full md:hidden">
          <a href="mailto:">Mở ứng dụng email</a>
        </Button>

        <div className="border border-border bg-surface-elevated/40 p-4 text-left">
          <p className="text-body-sm font-medium text-fg mb-2">Chưa nhận được email?</p>
          <p className="text-small text-fg-muted mb-3">
            Kiểm tra thư mục rác (Spam) hoặc yêu cầu gửi lại nếu quá 60 giây.
          </p>
          {!initialEmail ? (
            <div className="space-y-2 mb-3">
              <Label htmlFor="manual-email" className="text-small text-fg-muted">
                Email nhận liên kết
              </Label>
              <Input
                id="manual-email"
                type="email"
                value={inputEmail}
                onChange={(e) => setInputEmail(e.target.value)}
                placeholder="example@cinemo.vn"
              />
            </div>
          ) : null}
          <ResendConfirmButton email={initialEmail || inputEmail} className="w-full" />
        </div>
      </div>

      <p className="text-body-sm text-fg-muted">
        Đã xác nhận email?{" "}
        <Link href="/dang-nhap" className="text-link font-medium hover:underline underline-offset-4">
          Đăng nhập ngay
        </Link>
      </p>
    </div>
  );
}

export default function ConfirmEmailPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-fg-muted">Đang tải…</div>}>
      <ConfirmationContent />
    </Suspense>
  );
}
