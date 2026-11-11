import { Module } from "@nestjs/common";
import { IdentityController } from "./identity.controller";
import { IdentityService } from "./identity.service";

/**
 * IdentityModule: Quản lý phương thức đăng nhập OAuth, liên kết / huỷ liên kết MXH,
 * thêm mật khẩu cho tài khoản OAuth, xử lý Facebook không trả email, và bảo vệ AC-04.
 */
@Module({
  controllers: [IdentityController],
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
