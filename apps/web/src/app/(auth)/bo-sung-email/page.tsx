"use client";

import { missingEmailOAuthInputSchema } from "@filmbooking/shared/schemas/identity";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiError } from "@/lib/api/client";

// Thông báo trung tính: không cho biết email đã tồn tại hay chưa (R-12, chống dò email).
const NEUTRAL_MESSAGE =
  "Nếu email hợp lệ, chúng tôi đã gửi hướng dẫn tới hộp thư của bạn. Vui lòng kiểm tra email để hoàn tất đăng nhập.";

function MissingEmailForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  // AC-04: callback báo trùng email -> hướng dẫn đăng nhập bằng mật khẩu rồi liên kết, không tạo tài khoản mới.
  if (params.get("status") === "email_exists" || params.get("error") === "email_exists") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-h2 font-bold">Email này đã có tài khoản</h1>
        <p className="text-body-sm text-fg-secondary">
          Để bảo vệ tài khoản, chúng tôi không tự gộp. Hãy đăng nhập bằng email và mật khẩu, sau đó vào Bảo mật &amp;
          liên kết để liên kết Google/Facebook.
        </p>
        <Button asChild>
          <Link href="/dang-nhap?next=%2Ftai-khoan%2Fbao-mat">Đăng nhập bằng mật khẩu</Link>
        </Button>
      </div>
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const parsed = missingEmailOAuthInputSchema.safeParse({
      provider: "facebook",
      email,
      providerAccessToken: params.get("providerAccessToken") ?? undefined,
      oauthStateToken: params.get("oauthStateToken") ?? undefined,
    });
    if (!parsed.success) {
      setError("Vui lòng nhập email hợp lệ.");
      return;
    }
    setPending(true);
    try {
      await apiFetch("/auth/oauth/missing-email", { method: "POST", json: parsed.data });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429 ? err.message : "Không gửi được yêu cầu. Vui lòng thử lại.",
      );
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col gap-3" role="status">
        <h1 className="text-h2 font-bold">Kiểm tra hộp thư</h1>
        <p className="text-body-sm text-fg-secondary">{NEUTRAL_MESSAGE}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <h1 className="text-h2 font-bold">Bổ sung email</h1>
      <p className="text-body-sm text-fg-secondary">
        Facebook không chia sẻ email của bạn. Vui lòng nhập email để hoàn tất đăng nhập.
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="missing-email">Email</Label>
        <Input
          id="missing-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
          required
        />
      </div>
      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="gradient" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        Tiếp tục
      </Button>
    </form>
  );
}

export default function MissingEmailPage() {
  return (
    <Suspense>
      <MissingEmailForm />
    </Suspense>
  );
}
