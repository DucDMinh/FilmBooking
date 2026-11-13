const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * Harness ghi/xoá bằng service_role nên chỉ được chạy với Supabase local.
 * Throw (không skip) khi URL trỏ ra ngoài: skip sẽ che việc cấu hình nhầm staging/prod.
 */
export function assertLocalSupabaseUrl(rawUrl: string): void {
  let hostname: string;
  try {
    hostname = new URL(rawUrl).hostname;
  } catch {
    throw new Error(`[test:int] SUPABASE_URL không hợp lệ: "${rawUrl}"`);
  }
  if (!LOCAL_HOSTNAMES.has(hostname)) {
    throw new Error(
      `[test:int] Từ chối chạy: host "${hostname}" không phải Supabase local (127.0.0.1/localhost). Bỏ SUPABASE_* trỏ staging/prod khỏi shell.`,
    );
  }
}
