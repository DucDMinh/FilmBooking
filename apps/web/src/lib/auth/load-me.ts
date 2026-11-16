import type { MeResponse } from "@filmbooking/shared/schemas/me";

import { apiFetch } from "@/lib/api/client";

/**
 * Lấy /me cho điều hướng theo vai trò. Mọi lỗi (401, 403, API chết) → null: điều hướng này chỉ là UX,
 * nên fail-open (không chặn khách, nhân sự vẫn vào được trang như cũ) thay vì làm hỏng trang.
 */
export async function fetchMeOrNull(accessToken: string): Promise<MeResponse | null> {
  try {
    return await apiFetch<MeResponse>("/me", { accessToken, cache: "no-store" });
  } catch {
    return null;
  }
}
