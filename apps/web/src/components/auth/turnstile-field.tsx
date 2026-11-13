"use client";

import { Turnstile } from "@marsidev/react-turnstile";

/** Có site key thì Turnstile bắt buộc; thiếu key (dev/test) thì bỏ qua widget, API tự quyết bằng secret. */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined;

export function TurnstileField({
  onToken,
}: Readonly<{ onToken: (token: string | null) => void }>) {
  if (!TURNSTILE_SITE_KEY) return null;
  return (
    <div className="flex justify-center" data-testid="turnstile">
      <Turnstile
        siteKey={TURNSTILE_SITE_KEY}
        onSuccess={(token) => onToken(token)}
        onExpire={() => onToken(null)}
        onError={() => onToken(null)}
        options={{ theme: "dark", language: "vi" }}
      />
    </div>
  );
}
