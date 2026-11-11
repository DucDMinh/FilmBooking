import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put } from "@nestjs/common";
import {
  copySeatLayoutSchema,
  createRoomSchema,
  saveSeatLayoutSchema,
  updateRoomSchema,
  uuidSchema,
  type CopySeatLayoutInput,
  type CreateRoomInput,
  type SaveSeatLayoutInput,
  type UpdateRoomInput,
} from "@filmbooking/shared/schemas/cinema-ops";
import { CinemaScope, CurrentUser, Roles, type AuthUser } from "../../common/auth/decorators";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { SeatLayoutService } from "./seat-layout.service";

const uuidParam = new ZodValidationPipe(uuidSchema);

/**
 * Phòng chiếu + sơ đồ ghế (R-47, R-48). `@CinemaScope` ở cấp class: Manager chỉ thao tác rạp mình
 * (đọc: Staff trở lên), Admin qua mọi rạp.
 */
@CinemaScope()
@Controller("cinemas/:cinemaId/rooms")
export class RoomsController {
  constructor(@Inject(SeatLayoutService) private readonly layouts: SeatLayoutService) {}

  @Roles("STAFF")
  @Get()
  list(@CurrentUser() user: AuthUser, @Param("cinemaId", uuidParam) cinemaId: string) {
    return this.layouts.listRooms(user, cinemaId);
  }

  @Roles("MANAGER")
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param("cinemaId", uuidParam) cinemaId: string,
    @Body(new ZodValidationPipe(createRoomSchema)) body: CreateRoomInput,
  ) {
    return this.layouts.createRoom(user, cinemaId, body);
  }

  @Roles("MANAGER")
  @Patch(":roomId")
  update(
    @CurrentUser() user: AuthUser,
    @Param("cinemaId", uuidParam) cinemaId: string,
    @Param("roomId", uuidParam) roomId: string,
    @Body(new ZodValidationPipe(updateRoomSchema)) body: UpdateRoomInput,
  ) {
    return this.layouts.updateRoom(user, cinemaId, roomId, body);
  }

  @Roles("MANAGER")
  @Delete(":roomId")
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param("cinemaId", uuidParam) cinemaId: string,
    @Param("roomId", uuidParam) roomId: string,
  ): Promise<void> {
    await this.layouts.deleteRoom(user, cinemaId, roomId);
  }

  @Roles("STAFF")
  @Get(":roomId/seats")
  getLayout(
    @CurrentUser() user: AuthUser,
    @Param("cinemaId", uuidParam) cinemaId: string,
    @Param("roomId", uuidParam) roomId: string,
  ) {
    return this.layouts.getLayout(user, cinemaId, roomId);
  }

  @Roles("MANAGER")
  @Put(":roomId/seats")
  saveLayout(
    @CurrentUser() user: AuthUser,
    @Param("cinemaId", uuidParam) cinemaId: string,
    @Param("roomId", uuidParam) roomId: string,
    @Body(new ZodValidationPipe(saveSeatLayoutSchema)) body: SaveSeatLayoutInput,
  ) {
    return this.layouts.saveLayout(user, cinemaId, roomId, body);
  }

  @Roles("MANAGER")
  @Post(":roomId/seats/copy")
  copyLayout(
    @CurrentUser() user: AuthUser,
    @Param("cinemaId", uuidParam) cinemaId: string,
    @Param("roomId", uuidParam) roomId: string,
    @Body(new ZodValidationPipe(copySeatLayoutSchema)) body: CopySeatLayoutInput,
  ) {
    return this.layouts.copyLayout(user, cinemaId, roomId, body.sourceRoomId);
  }
}
