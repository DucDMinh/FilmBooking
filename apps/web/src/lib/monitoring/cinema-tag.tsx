"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/** Gắn tag `cinema_id` cho mọi event lỗi phát sinh khi người dùng đang ở trang của rạp này (NFR-14). */
export function CinemaTag({ cinemaId }: Readonly<{ cinemaId: string }>) {
  useEffect(() => {
    Sentry.setTag("cinema_id", cinemaId);
    return () => Sentry.setTag("cinema_id", undefined);
  }, [cinemaId]);
  return null;
}
