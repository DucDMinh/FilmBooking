import type { Metadata } from "next";
import Link from "next/link";

import { loadRoomAccess, rethrowRoomApiError } from "@/components/admin/room-access";
import { RoomLayoutPanel } from "@/components/admin/room-layout-panel";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api/client";
import type { SeatCellInput } from "@filmbooking/shared/schemas/cinema-ops";

export const metadata: Metadata = { title: "Sơ đồ ghế", robots: { index: false } };
export const dynamic = "force-dynamic";

interface LayoutDto {
  room: { id: string; name: string; status: string; gridRows: number; gridCols: number };
  cells: (SeatCellInput & { id: string })[];
}

/** Màn 22: trình chỉnh sơ đồ ghế của một phòng. Staff / Manager rạp khác chỉ xem. */
export default async function RoomLayoutPage({ params }: Readonly<{ params: Promise<{ id: string; roomId: string }> }>) {
  const { id: cinemaId, roomId } = await params;
  const access = await loadRoomAccess(cinemaId);

  let layout: LayoutDto;
  try {
    layout = await apiFetch<LayoutDto>(`/cinemas/${cinemaId}/rooms/${roomId}/seats`, {
      accessToken: access.accessToken,
      cache: "no-store",
    });
  } catch (error) {
    rethrowRoomApiError(error);
  }
  const cells: SeatCellInput[] = layout.cells.map(({ row, col, type }) => ({ row, col, type }));

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/rap/${cinemaId}/phong`} className="text-body-sm text-fg-secondary hover:underline">
          ← Phòng chiếu
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-h1 font-bold uppercase">{layout.room.name}</h1>
          <Badge tone={layout.room.status === "ACTIVE" ? "success" : "warning"}>
            {layout.room.status === "ACTIVE" ? "Hoạt động" : "Bảo trì"}
          </Badge>
        </div>
        <p className="text-body-sm text-fg-secondary">
          Lưới {layout.room.gridRows} hàng × {layout.room.gridCols} cột
        </p>
      </div>
      <RoomLayoutPanel
        cinemaId={cinemaId}
        roomId={roomId}
        gridRows={layout.room.gridRows}
        gridCols={layout.room.gridCols}
        initialCells={cells}
        canEdit={access.canEdit}
        cinemas={access.sourceCinemas}
      />
    </div>
  );
}
