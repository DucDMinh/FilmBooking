import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ERROR_CODES } from "@filmbooking/shared";
import type { CreateUploadInput, UploadTicketDto } from "@filmbooking/shared/schemas/catalog";
import type { UserAccess } from "../../common/auth/access.service";
import type { AuthUser } from "../../common/auth/decorators";
import { AppException } from "../../common/errors/app-exception";
import { SupabaseService } from "../../common/supabase/supabase.service";

const EXTENSIONS: Record<CreateUploadInput["contentType"], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Admin được ghi `new/` khi tạo rạp mới (chưa có id); policy storage cho Admin ghi mọi thư mục. */
const NEW_CINEMA_FOLDER = "new";

@Injectable()
export class UploadsService {
  constructor(@Inject(SupabaseService) private readonly supabase: SupabaseService) {}

  /**
   * Cấp signed upload URL. Nest kiểm quyền trước (posters/banners: Admin; cinema-images: Admin hoặc Manager rạp đó),
   * và upload dùng JWT của user nên policy storage (RLS) vẫn là lớp chặn thứ hai. Loại/kích thước đã kiểm ở schema.
   */
  async createTicket(user: AuthUser, access: UserAccess, input: CreateUploadInput): Promise<UploadTicketDto> {
    const folder = this.resolveFolder(access, input);
    const path = `${folder}${randomUUID()}.${EXTENSIONS[input.contentType]}`;
    const storage = this.supabase.forUser(user.jwt).storage.from(input.bucket);
    const signed = await storage.createSignedUploadUrl(path);
    if (signed.error) throw new AppException(ERROR_CODES.INTERNAL_ERROR, "Cannot create upload URL");
    return {
      path,
      token: signed.data.token,
      signedUrl: signed.data.signedUrl,
      publicUrl: storage.getPublicUrl(path).data.publicUrl,
    };
  }

  /** Thư mục đích (kết thúc bằng "/" hoặc rỗng). */
  private resolveFolder(access: UserAccess, input: CreateUploadInput): string {
    if (input.bucket !== "cinema-images") {
      if (!access.isAdmin) throw new AppException(ERROR_CODES.FORBIDDEN, "Only an admin can upload movie images");
      return "";
    }
    if (!input.cinemaId) {
      if (!access.isAdmin) throw new AppException(ERROR_CODES.FORBIDDEN_CINEMA, "cinemaId is required");
      return `${NEW_CINEMA_FOLDER}/`;
    }
    if (!access.isAdmin && access.cinemaRoles.get(input.cinemaId) !== "MANAGER") {
      throw new AppException(ERROR_CODES.FORBIDDEN_CINEMA, "No access to this cinema");
    }
    return `${input.cinemaId}/`;
  }
}
