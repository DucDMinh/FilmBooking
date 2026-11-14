"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api/client";
import type { SeatCellInput } from "@filmbooking/shared/schemas/cinema-ops";

import { CopyLayoutDialog, type CopySourceCinema } from "./copy-layout-dialog";
import { SeatLayoutEditor } from "./seat-layout-editor";

export interface RoomLayoutPanelProps {
  cinemaId: string;
  roomId: string;
  gridRows: number;
  gridCols: number;
  initialCells: readonly SeatCellInput[];
  canEdit: boolean;
  cinemas: readonly CopySourceCinema[];
}

/** Gắn editor với API lưu/sao chép; sau khi lưu hoặc sao chép nạp lại từ server để thấy đúng dữ liệu đã lưu. */
export function RoomLayoutPanel({
  cinemaId,
  roomId,
  gridRows,
  gridCols,
  initialCells,
  canEdit,
  cinemas,
}: Readonly<RoomLayoutPanelProps>) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);

  const save = async (cells: SeatCellInput[]) => {
    setSaving(true);
    setSaveError(null);
    try {
      await apiFetch(`/cinemas/${cinemaId}/rooms/${roomId}/seats`, { method: "PUT", json: { cells } });
      toast.success("Đã lưu sơ đồ ghế");
      router.refresh();
    } catch (e) {
      const hasShowtimes = e instanceof ApiError && e.details?.reason === "ROOM_HAS_UPCOMING_SHOWTIMES";
      setSaveError(
        hasShowtimes
          ? "Phòng còn suất sắp chiếu, không thể sửa sơ đồ. Huỷ các suất đó trước."
          : e instanceof ApiError
            ? e.message
            : "Không lưu được sơ đồ.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <Button type="button" variant="outline" className="min-h-11" onClick={() => setCopyOpen(true)}>
          Sao chép sơ đồ từ phòng khác
        </Button>
      )}
      <SeatLayoutEditor
        // Nạp lại state editor khi dữ liệu server đổi (sau lưu/sao chép).
        key={`${gridRows}x${gridCols}${JSON.stringify(initialCells)}`}
        gridRows={gridRows}
        gridCols={gridCols}
        initialCells={initialCells}
        readOnly={!canEdit}
        saving={saving}
        saveError={saveError}
        onSave={save}
      />
      {canEdit && (
        <CopyLayoutDialog
          open={copyOpen}
          onOpenChange={setCopyOpen}
          cinemaId={cinemaId}
          roomId={roomId}
          cinemas={cinemas}
          onCopied={() => router.refresh()}
        />
      )}
    </div>
  );
}
