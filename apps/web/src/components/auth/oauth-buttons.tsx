"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import { Button } from "@/components/ui/button";
import { sanitizeNext } from "@/lib/auth/safe-next";
import { getSupabaseEnv } from "@/lib/supabase/env";

interface OAuthButtonsProps {
  next?: string | null;
}

function GoogleIcon() {
  return (
    <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg className="size-4 shrink-0" fill="#1877F2" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

const PROVIDERS = [
  { id: "google", label: "Tiếp tục với Google", icon: GoogleIcon },
  { id: "facebook", label: "Tiếp tục với Facebook", icon: FacebookIcon },
] as const;

/**
 * Nút đăng nhập / đăng ký nhanh OAuth (R-18).
 * Gọi Supabase Auth OAuth PKCE trực tiếp, redirect về /auth/callback kèm `next` an toàn.
 */
export function OAuthButtons({ next }: Readonly<OAuthButtonsProps>) {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleOAuth = async (provider: "google" | "facebook") => {
    try {
      setLoadingProvider(provider);
      setError(null);
      const { url, anonKey } = getSupabaseEnv();
      const supabase = createBrowserClient(url, anonKey);
      const safeNext = sanitizeNext(next);
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const callbackUrl = new URL("/auth/callback", origin);
      if (safeNext) {
        callbackUrl.searchParams.set("next", safeNext);
      }

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: callbackUrl.toString(),
        },
      });

      if (oauthError) {
        setError(oauthError.message);
        setLoadingProvider(null);
      }
    } catch {
      setError("Không thể khởi động đăng nhập. Vui lòng thử lại.");
      setLoadingProvider(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-small text-fg-muted" role="separator" aria-label="hoặc">
        <span className="h-px flex-1 bg-border" />
        HOẶC
        <span className="h-px flex-1 bg-border" />
      </div>

      {error ? (
        <p role="alert" className="text-small text-danger text-center">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-2.5">
        {PROVIDERS.map(({ id, label, icon: Icon }) => {
          const isLoading = loadingProvider === id;
          return (
            <Button
              key={id}
              type="button"
              variant="secondary"
              className="w-full gap-2.5 justify-center font-medium"
              disabled={loadingProvider !== null}
              aria-disabled={loadingProvider !== null}
              onClick={() => handleOAuth(id)}
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Icon />
              )}
              <span>{label}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
