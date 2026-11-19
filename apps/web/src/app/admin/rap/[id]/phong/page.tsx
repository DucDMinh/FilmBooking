import type { Metadata } from "next";
import Link from "next/link";

import { loadRoomAccess, rethrowRoomApiError } from "@/components/admin/room-access";
import { RoomsManager, type RoomListItem } from "@/components/admin/rooms-manager";
import { apiFetch } from "@/lib/api/client";
import type { SeatCellInput } from "@filmbooking/shared/schemas/cinema-ops";

export const metadata: Metadata = { title: "Phòng chiếu", robots: { index: false } };
export const dynamic = "force-dynamic";

interface RoomDto {
  id: string;
  name: string;
  supportedFormats: string[];
  status: string;
  gridRows: number;
  gridCols: number;
}

interface LayoutDto {
  cells: (SeatCellInput & { id: string })[];
}

const SELLABLE = new Set(["standard", "vip", "sweetbox"]);

/** Màn B21: danh sách phòng của một rạp. Quyền thật do API (@CinemaScope); canEdit chỉ ẩn nút. */
export default async function RoomsPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id: cinemaId } = await params;
  const access = await loadRoomAccess(cinemaId);
  const opts = { accessToken: access.accessToken, cache: "no-store" } as const;

  let rooms: RoomDto[];
  try {
    rooms = await apiFetch<RoomDto[]>(`/cinemas/${cinemaId}/rooms`, opts);
  } catch (error) {
    rethrowRoomApiError(error);
  }
  const items: RoomListItem[] = await Promise.all(
    rooms.map(async (room) => {
      const layout = await apiFetch<LayoutDto>(`/cinemas/${cinemaId}/rooms/${room.id}/seats`, opts).catch(() => null);
      const seatCount = layout ? layout.cells.filter((cell) => SELLABLE.has(cell.type)).length : null;
      return { ...room, seatCount };
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/rap" className="text-body-sm text-fg-secondary hover:underline">
          ← Rạp chiếu
        </Link>
        <h1 className="mt-1 text-h1 font-bold uppercase">Phòng chiếu</h1>
      </div>
      <RoomsManager cinemaId={cinemaId} rooms={items} canEdit={access.canEdit} />
    </div>
  );
}
