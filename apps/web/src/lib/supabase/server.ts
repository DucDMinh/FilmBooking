import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { sessionCookieOptions } from "./cookie-options";
import { getSupabaseEnv } from "./env";

/** Client Supabase cho Server Component / Route Handler (anon key, đọc cookie HttpOnly). */
export async function createServerSupabase() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(items) {
        try {
          for (const { name, value, options } of items) {
            cookieStore.set(name, value, sessionCookieOptions(options));
          }
        } catch {
          // Gọi từ Server Component (cookie read-only): proxy.ts đã refresh phiên.
        }
      },
    },
  });
}

/** Access token cho `apiFetch({ accessToken })` phía server và cho /api/proxy. */
export async function getServerAccessToken(): Promise<string | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
