import { NextResponse, type NextRequest } from "next/server";
import { getServerAccessToken } from "@/lib/supabase/server";

/**
 * LƯU Ý: proxy KHÔNG phải lớp authz. Không có phiên vẫn chuyển tiếp (không kèm Authorization);
 * Nest (AuthGuard / @Public) quyết định 401 hay cho qua.
 *
 * Proxy mỏng trình duyệt -> Nest. Token nằm trong cookie HttpOnly nên chỉ server đọc được:
 * handler này gắn `Authorization: Bearer` rồi chuyển tiếp; KHÔNG chuyển cookie sang Nest.
 */
const MAX_BODY_BYTES = 1024 * 1024;
const FORWARD_REQUEST_HEADERS = ["content-type", "accept", "accept-language", "idempotency-key"];
const FORWARD_RESPONSE_HEADERS = ["content-type", "retry-after"];
const SAFE_SEGMENT = /^[A-Za-z0-9_~-]+(\.[A-Za-z0-9_~-]+)*$/; // không "..", không "/", không "%"

type RouteContext = { params: Promise<{ path: string[] }> };

function jsonError(status: number, code: string): NextResponse {
  return NextResponse.json({ error: { code, message: code } }, { status });
}

function upstreamBase(): string {
  return (process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
}

async function forward(request: NextRequest, { params }: RouteContext): Promise<NextResponse> {
  const { path } = await params;
  if (!path.length || !path.every((s) => SAFE_SEGMENT.test(s))) return jsonError(400, "VALIDATION_ERROR");

  const isRead = request.method === "GET" || request.method === "HEAD";
  // CSRF bổ sung cho SameSite=Lax: mutation phải cùng origin.
  const origin = request.headers.get("origin");
  if (!isRead && origin && origin !== request.nextUrl.origin) return jsonError(403, "FORBIDDEN");

  const token = await getServerAccessToken();
  const base = upstreamBase();
  if (!base) return jsonError(500, "INTERNAL_ERROR");

  let body: ArrayBuffer | undefined;
  if (!isRead) {
    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_BODY_BYTES) return jsonError(413, "VALIDATION_ERROR");
    body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) return jsonError(413, "VALIDATION_ERROR");
  }

  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let upstream: Response;
  try {
    upstream = await fetch(`${base}/${path.join("/")}${request.nextUrl.search}`, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
    });
  } catch {
    return jsonError(502, "INTERNAL_ERROR");
  }

  const out = new Headers();
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  return new NextResponse(upstream.status === 204 ? null : await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: out,
  });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
