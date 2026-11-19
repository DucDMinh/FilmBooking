"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, apiFetch } from "@/lib/api/client";

export interface CopySourceCinema {
  id: string;
  /** Mã rạp: endpoint công khai GET /cinemas/:code trả danh sách phòng của mọi rạp. */
  code: string;
  name: string;
}

interface RoomOption {
  id: string;
  name: string;
}

export interface CopyLayoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cinemaId: string;
  roomId: string;
  /** Rạp có thể chọn làm nguồn. Sơ đồ ghế đọc công khai; API chỉ kiểm quyền ghi ở phòng đích (R-48). */
  cinemas: readonly CopySourceCinema[];
  onCopied: () => void;
}

/** Sao chép sơ đồ từ phòng khác (R-48): ghi đè sơ đồ hiện tại bằng một bản độc lập. */
export function CopyLayoutDialog({
  open,
  onOpenChange,
  cinemaId,
  roomId,
  cinemas,
  onCopied,
}: Readonly<CopyLayoutDialogProps>) {
  const [sourceCinemaId, setSourceCinemaId] = useState(() => (cinemas.some((c) => c.id === cinemaId) ? cinemaId : (cinemas[0]?.id ?? "")));
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [sourceRoomId, setSourceRoomId] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSourceRoomId("");
    const code = cinemas.find((c) => c.id === sourceCinemaId)?.code;
    if (!code) {
      setLoading(false);
      return;
    }
    apiFetch<{ rooms: RoomOption[] }>(`/cinemas/${encodeURIComponent(code)}`)
      .then((detail) => {
        if (!cancelled) setRooms(detail.rooms.filter((room) => room.id !== roomId));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setRooms([]);
        setError(e instanceof ApiError ? e.message : "Không tải được danh sách phòng.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, sourceCinemaId, roomId, cinemas]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/cinemas/${cinemaId}/rooms/${roomId}/seats/copy`, {
        method: "POST",
        json: { sourceRoomId },
      });
      toast.success("Đã sao chép sơ đồ ghế");
      onOpenChange(false);
      onCopied();
    } catch (e) {
      const hasShowtimes = e instanceof ApiError && e.details?.reason === "ROOM_HAS_UPCOMING_SHOWTIMES";
      setError(
        hasShowtimes
          ? "Phòng còn suất sắp chiếu, không thể đổi sơ đồ. Huỷ các suất đó trước."
          : e instanceof ApiError
            ? e.message
            : "Không sao chép được sơ đồ.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sao chép sơ đồ từ phòng khác</DialogTitle>
          <DialogDescription>
            Sơ đồ ghế hiện tại sẽ bị ghi đè bằng một bản sao độc lập; sửa phòng nguồn sau đó không ảnh hưởng phòng này.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {cinemas.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="copy-cinema">Rạp nguồn</Label>
              <Select value={sourceCinemaId} onValueChange={setSourceCinemaId}>
                <SelectTrigger id="copy-cinema" className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {cinemas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="copy-room">Phòng nguồn</Label>
            <Select value={sourceRoomId} onValueChange={setSourceRoomId} disabled={loading || rooms.length === 0}>
              <SelectTrigger id="copy-room" className="min-h-11 w-full">
                <SelectValue placeholder={loading ? "Đang tải…" : rooms.length === 0 ? "Không có phòng" : "Chọn phòng"} />
              </SelectTrigger>
              <SelectContent>
                {rooms.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-body-sm text-warning">
            Nếu phòng nguồn có lưới (hàng × cột) khác phòng này, kích thước lưới của phòng này sẽ đổi theo phòng nguồn.
          </p>
          {error && (
            <p role="alert" className="text-body-sm text-danger-text">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" className="min-h-11" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button type="button" className="min-h-11" disabled={!sourceRoomId || submitting} onClick={submit}>
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
            Ghi đè sơ đồ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
