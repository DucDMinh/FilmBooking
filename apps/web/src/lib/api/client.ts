import type { ErrorCode } from "@filmbooking/shared/errors";
import { GENERIC_ERROR_MESSAGE, isKnownErrorCode, messageForErrorCode } from "./error-messages";

export class ApiError extends Error {
  constructor(
    /** Mã lỗi API đã biết, hoặc "UNKNOWN" khi body không đúng dạng / lỗi mạng. */
    readonly code: ErrorCode | "UNKNOWN",
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiRequestInit extends Omit<RequestInit, "body"> {
  /** JSON body (tự stringify). */
  json?: unknown;
  /**
   * Chỉ dùng phía server: access token từ `getServerAccessToken()` (lib/supabase/server).
   * Trình duyệt không bao giờ thấy token (cookie HttpOnly) — nó gọi qua /api/proxy.
   */
  accessToken?: string | null;
}

const BROWSER_PROXY_BASE = "/api/proxy";

function baseUrl(): string {
  if (typeof window !== "undefined") return BROWSER_PROXY_BASE;
  return (process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
}

async function toApiError(res: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  const err = (body as { error?: { code?: unknown; details?: unknown } } | null | undefined)?.error;
  if (err && isKnownErrorCode(err.code)) {
    const details =
      err.details && typeof err.details === "object" ? (err.details as Record<string, unknown>) : undefined;
    return new ApiError(err.code, messageForErrorCode(err.code), res.status, details);
  }
  return new ApiError("UNKNOWN", GENERIC_ERROR_MESSAGE, res.status);
}

/** Gọi REST API; ném `ApiError` (message tiếng Việt) khi response không ok hoặc body không phải JSON. */
export async function apiFetch<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const { json, accessToken, headers: initHeaders, ...rest } = init;
  const headers = new Headers(initHeaders);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (json !== undefined) headers.set("Content-Type", "application/json");

  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      ...rest,
      headers,
      body: json !== undefined ? JSON.stringify(json) : undefined,
    });
  } catch {
    throw new ApiError("UNKNOWN", "Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.", 0);
  }
  if (!res.ok) throw await toApiError(res);

  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError("UNKNOWN", GENERIC_ERROR_MESSAGE, res.status);
  }
}
