import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req } from "@nestjs/common";
import {
  cinemaDetailQuerySchema,
  codeParamSchema,
  createCinemaSchema,
  idParamSchema,
  listCinemasQuerySchema,
  updateCinemaSchema,
  type CinemaDto,
  type CreateCinemaInput,
  type ProvinceDto,
  type UpdateCinemaInput,
} from "@filmbooking/shared/schemas/catalog";
import { AccessService, type AuthenticatedRequest } from "../../common/auth/access.service";
import { CinemaScope, CurrentUser, Public, Roles, type AuthUser } from "../../common/auth/decorators";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CinemasService, type CinemaDetailDto } from "./cinemas.service";

@Controller()
export class CinemasController {
  constructor(
    @Inject(CinemasService) private readonly cinemas: CinemasService,
    @Inject(AccessService) private readonly access: AccessService,
  ) {}

  @Public()
  @Get("provinces")
  provinces(): Promise<ProvinceDto[]> {
    return this.cinemas.listProvinces();
  }

  @Public()
  @Get("cinemas")
  list(@Query(new ZodValidationPipe(listCinemasQuerySchema)) query: { province?: string }): Promise<CinemaDto[]> {
    return this.cinemas.listPublic(query.province);
  }

  @Public()
  @Get("cinemas/:code")
  detail(
    @Param("code", new ZodValidationPipe(codeParamSchema)) code: string,
    @Query(new ZodValidationPipe(cinemaDetailQuerySchema)) query: { date?: string },
  ): Promise<CinemaDetailDto> {
    return this.cinemas.detailPublic(code, query.date);
  }

  @Roles("ADMIN")
  @Post("admin/cinemas")
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCinemaSchema)) body: CreateCinemaInput,
  ): Promise<CinemaDto> {
    return this.cinemas.create(user.jwt, body);
  }

  /** Manager chỉ sửa rạp được gán (CinemaScope đọc param `cinemaId`); Admin qua mọi rạp. */
  @Roles("MANAGER")
  @CinemaScope()
  @Patch("admin/cinemas/:cinemaId")
  async update(
    @Req() request: AuthenticatedRequest,
    @Param("cinemaId", new ZodValidationPipe(idParamSchema)) cinemaId: string,
    @Body(new ZodValidationPipe(updateCinemaSchema)) body: UpdateCinemaInput,
  ): Promise<CinemaDto> {
    const { isAdmin } = await this.access.loadForRequest(request);
    return this.cinemas.update(request.user.jwt, cinemaId, body, isAdmin);
  }
}
