"use client";

import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { Turnstile } from "@marsidev/react-turnstile";

/** Có site key thì Turnstile bắt buộc; thiếu key (dev/test) thì bỏ qua widget, API tự quyết bằng secret. */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined;

export function TurnstileField({
  onToken,
  turnstileRef,
}: Readonly<{
  onToken: (token: string | null) => void;
  turnstileRef?: React.RefObject<TurnstileInstance | null | undefined>;
}>) {
  if (!TURNSTILE_SITE_KEY) return null;
  return (
    <div className="flex justify-center" data-testid="turnstile">
      <Turnstile
        ref={turnstileRef as React.Ref<TurnstileInstance>}
        siteKey={TURNSTILE_SITE_KEY}
        onSuccess={(token) => onToken(token)}
        onExpire={() => onToken(null)}
        onError={() => onToken(null)}
        options={{ theme: "dark", language: "vi" }}
      />
    </div>
  );
}
