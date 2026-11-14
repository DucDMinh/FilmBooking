"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { SCREEN_FORMATS, type ScreenFormat } from "@filmbooking/shared";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, apiFetch } from "@/lib/api/client";

export interface RoomListItem {
  id: string;
  name: string;
  supportedFormats: string[];
  status: string;
  gridRows: number;
  gridCols: number;
  /** null = không đọc được sơ đồ. */
  seatCount: number | null;
}

const STATUS_LABEL: Record<string, string> = { ACTIVE: "Hoạt động", MAINTENANCE: "Bảo trì" };

const FORMATS: readonly ScreenFormat[] = SCREEN_FORMATS;

interface FormState {
  name: string;
  formats: ScreenFormat[];
  status: "ACTIVE" | "MAINTENANCE";
  gridRows: number;
  gridCols: number;
}

const EMPTY_FORM: FormState = { name: "", formats: ["2D"], status: "ACTIVE", gridRows: 10, gridCols: 12 };

/** Chỉ gửi trường người dùng thực sự đổi, để sửa tên không ghi đè định dạng/trạng thái hiện có. */
export function buildRoomPatch(
  room: Pick<RoomListItem, "name" | "supportedFormats" | "status">,
  form: Pick<FormState, "name" | "formats" | "status">,
) {
  const patch: { name?: string; supportedFormats?: ScreenFormat[]; status?: FormState["status"] } = {};
  const name = form.name.trim();
  if (name !== room.name) patch.name = name;
  const same =
    form.formats.length === room.supportedFormats.length && form.formats.every((f) => room.supportedFormats.includes(f));
  if (!same) patch.supportedFormats = form.formats;
  if (form.status !== room.status) patch.status = form.status;
  return patch;
}

/** Danh sách phòng + dialog thêm/sửa phòng (design-spec 22 / B21). Kích thước lưới chỉ chọn lúc tạo (API không cho sửa). */
export function RoomsManager({
  cinemaId,
  rooms,
  canEdit,
}: Readonly<{ cinemaId: string; rooms: readonly RoomListItem[]; canEdit: boolean }>) {
  const router = useRouter();
  const [editing, setEditing] = useState<RoomListItem | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openDialog = (target: RoomListItem | "new") => {
    setError(null);
    setForm(
      target === "new"
        ? EMPTY_FORM
        : {
            name: target.name,
            formats: FORMATS.filter((f) => target.supportedFormats.includes(f)),
            status: target.status === "MAINTENANCE" ? "MAINTENANCE" : "ACTIVE",
            gridRows: target.gridRows,
            gridCols: target.gridCols,
          },
    );
    setEditing(target);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Vui lòng nhập tên phòng.");
      return;
    }
    if (form.formats.length === 0) {
      setError("Chọn ít nhất một định dạng.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (editing === "new") {
        await apiFetch(`/cinemas/${cinemaId}/rooms`, {
          method: "POST",
          json: {
            name: form.name.trim(),
            supportedFormats: form.formats,
            status: form.status,
            gridRows: form.gridRows,
            gridCols: form.gridCols,
          },
        });
      } else if (editing) {
        const patch = buildRoomPatch(editing, form);
        if (Object.keys(patch).length > 0) {
          await apiFetch(`/cinemas/${cinemaId}/rooms/${editing.id}`, { method: "PATCH", json: patch });
        }
      }
      toast.success("Đã lưu phòng chiếu");
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Không lưu được phòng.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleFormat = (format: ScreenFormat, on: boolean) =>
    setForm({ ...form, formats: FORMATS.filter((f) => (f === format ? on : form.formats.includes(f))) });

  const numberField = (key: "gridRows" | "gridCols", label: string, max: number) => (
    <div className="space-y-2">
      <Label htmlFor={`room-${key}`}>{label}</Label>
      <Input
        id={`room-${key}`}
        type="number"
        min={1}
        max={max}
        className="min-h-11"
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: Math.min(max, Math.max(1, Number(e.target.value) || 1)) })}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      {canEdit && (
        <Button type="button" className="min-h-11" onClick={() => openDialog("new")}>
          ＋ Thêm phòng
        </Button>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tên phòng</TableHead>
            <TableHead>Định dạng</TableHead>
            <TableHead>Số ghế</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead>Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rooms.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-fg-muted">
                Rạp chưa có phòng chiếu.
              </TableCell>
            </TableRow>
          )}
          {rooms.map((room) => (
            <TableRow key={room.id}>
              <TableCell className="font-semibold">{room.name}</TableCell>
              <TableCell>{room.supportedFormats.join(" / ")}</TableCell>
              <TableCell className="tabular">{room.seatCount ?? "—"}</TableCell>
              <TableCell>
                <Badge tone={room.status === "ACTIVE" ? "success" : "warning"}>
                  {STATUS_LABEL[room.status] ?? room.status}
                </Badge>
              </TableCell>
              <TableCell className="space-x-2 whitespace-nowrap">
                <Link
                  href={`/admin/rap/${cinemaId}/phong/${room.id}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Sơ đồ ghế
                </Link>
                {canEdit && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => openDialog(room)}>
                    Sửa
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{editing === "new" ? "Thêm phòng chiếu" : "Sửa phòng chiếu"}</DialogTitle>
              <DialogDescription>
                {editing === "new" ? "Sơ đồ ghế dựng sau khi tạo phòng." : "Kích thước lưới không đổi được sau khi tạo."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="room-name">Tên phòng</Label>
              <Input
                id="room-name"
                className="min-h-11"
                value={form.name}
                maxLength={100}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <fieldset className="space-y-2">
                <legend className="text-small font-medium">Định dạng hỗ trợ</legend>
                <div className="flex min-h-11 items-center gap-4">
                  {FORMATS.map((f) => (
                    <div key={f} className="flex items-center gap-2">
                      <Checkbox
                        id={`room-format-${f}`}
                        checked={form.formats.includes(f)}
                        onCheckedChange={(checked) => toggleFormat(f, checked === true)}
                      />
                      <Label htmlFor={`room-format-${f}`}>{f}</Label>
                    </div>
                  ))}
                </div>
              </fieldset>
              <div className="space-y-2">
                <Label htmlFor="room-status">Trạng thái</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as FormState["status"] })}>
                  <SelectTrigger id="room-status" className="min-h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Hoạt động</SelectItem>
                    <SelectItem value="MAINTENANCE">Bảo trì</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {editing === "new" && (
              <div className="grid gap-4 sm:grid-cols-2">
                {numberField("gridRows", "Số hàng (tối đa 26)", 26)}
                {numberField("gridCols", "Số cột (tối đa 60)", 60)}
              </div>
            )}
            {error && (
              <p role="alert" className="text-body-sm text-danger">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" className="min-h-11" onClick={() => setEditing(null)}>
                Huỷ
              </Button>
              <Button type="submit" className="min-h-11" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
                Lưu
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
