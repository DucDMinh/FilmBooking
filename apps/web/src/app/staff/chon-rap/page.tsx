"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  loadStaffCinemas,
  readSelectedCinemaId,
  saveSelectedCinemaId,
  type StaffCinema,
} from "@/components/staff/staff-cinema";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** B14: chọn rạp làm việc, lưu theo phiên trình duyệt. Chỉ 1 rạp → bỏ qua màn này. */
export default function ChooseCinemaPage() {
  const router = useRouter();
  const [cinemas, setCinemas] = useState<StaffCinema[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    loadStaffCinemas()
      .then((list) => {
        const [only] = list;
        if (list.length === 1 && only) {
          saveSelectedCinemaId(only.id);
          router.replace("/staff/soat-ve");
          return;
        }
        const previous = readSelectedCinemaId();
        setSelected(list.some((c) => c.id === previous) ? previous : null);
        setCinemas(list);
      })
      .catch(() => setFailed(true));
  }, [router]);

  function start() {
    if (!selected) return;
    saveSelectedCinemaId(selected);
    router.push("/staff/soat-ve");
  }

  if (failed) {
    return <p className="p-6 text-body text-danger">Không tải được danh sách rạp. Vui lòng tải lại trang.</p>;
  }
  if (!cinemas) return <p className="p-6 text-body text-fg-secondary">Đang tải…</p>;
  if (cinemas.length === 0) {
    return <p className="p-6 text-body text-fg-secondary">Tài khoản chưa được gán rạp nào.</p>;
  }

  return (
    <main className="mx-auto w-full max-w-lg space-y-4 px-4 py-8">
      <h1 className="text-h1 font-bold">Chọn rạp bạn đang làm việc</h1>
      <fieldset className="space-y-2">
        <legend className="sr-only">Danh sách rạp</legend>
        {cinemas.map((cinema) => (
          <label
            key={cinema.id}
            className={cn(
              "flex min-h-14 cursor-pointer items-start gap-3 rounded-md border p-3",
              selected === cinema.id ? "border-brand bg-surface" : "border-border",
            )}
          >
            <input
              type="radio"
              name="cinema"
              className="mt-1 size-5"
              checked={selected === cinema.id}
              onChange={() => setSelected(cinema.id)}
            />
            <span>
              <span className="block text-body font-semibold">
                {cinema.code} • {cinema.name}
              </span>
              <span className="block text-body-sm text-fg-secondary">{cinema.address}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <Button type="button" variant="gradient" size="lg" className="w-full" disabled={!selected} onClick={start}>
        Bắt đầu soát vé
      </Button>
    </main>
  );
}
