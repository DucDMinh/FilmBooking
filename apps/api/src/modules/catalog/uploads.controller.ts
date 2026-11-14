import { Body, Controller, Inject, Post, Req } from "@nestjs/common";
import {
  createUploadSchema,
  type CreateUploadInput,
  type UploadTicketDto,
} from "@filmbooking/shared/schemas/catalog";
import { AccessService, type AuthenticatedRequest } from "../../common/auth/access.service";
import { Roles } from "../../common/auth/decorators";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { UploadsService } from "./uploads.service";

@Controller()
export class UploadsController {
  constructor(
    @Inject(UploadsService) private readonly uploads: UploadsService,
    @Inject(AccessService) private readonly access: AccessService,
  ) {}

  /** `@Roles("MANAGER")` loại Staff/Customer; quyền theo bucket/rạp do service kiểm. */
  @Roles("MANAGER")
  @Post("admin/uploads")
  async create(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createUploadSchema)) body: CreateUploadInput,
  ): Promise<UploadTicketDto> {
    const access = await this.access.loadForRequest(request);
    return this.uploads.createTicket(request.user, access, body);
  }
}
