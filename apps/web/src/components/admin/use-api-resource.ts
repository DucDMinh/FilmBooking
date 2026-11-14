"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api/client";

export type ResourceState<T> =
  | { status: "loading" }
  | { status: "error"; message: string; httpStatus: number | null }
  | { status: "ready"; data: T };

/**
 * GET một endpoint API. Khi tải lại / đổi path / lỗi, dữ liệu cũ bị bỏ ngay (không render lại dữ liệu cũ sau lỗi).
 * 403 → /khong-co-quyen. `path = null` = chưa tải (chờ điều kiện).
 */
export function useApiResource<T>(path: string | null): { state: ResourceState<T>; reload: () => void } {
  const router = useRouter();
  // Giữ router trong ref để không chạy lại effect khi identity của router đổi.
  const routerRef = useRef(router);
  routerRef.current = router;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ResourceState<T>>({ status: "loading" });
  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (path === null) return;
    let active = true;
    setState({ status: "loading" });
    apiFetch<T>(path, { cache: "no-store" })
      .then((data) => active && setState({ status: "ready", data }))
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 403) {
          routerRef.current.replace("/khong-co-quyen");
          return;
        }
        const known = error instanceof ApiError;
        setState({
          status: "error",
          message: known ? error.message : "Đã có lỗi xảy ra. Vui lòng thử lại sau.",
          httpStatus: known ? error.status : null,
        });
      });
    return () => {
      active = false;
    };
  }, [path, attempt]);

  return { state, reload };
}
