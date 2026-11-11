import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ERROR_CODES } from "@filmbooking/shared";
import { jwtVerify } from "jose";
import { ENV, type Env } from "../../config/env";
import { AppException } from "../errors/app-exception";
import { IS_PUBLIC_KEY, type AuthUser } from "./decorators";

interface SupabaseClaims {
  sub?: string;
  email?: string;
}

interface AuthRequest {
  headers: Record<string, string | undefined>;
  user?: AuthUser;
}

/**
 * Xác thực JWT Supabase (HS256, SUPABASE_JWT_SECRET, aud=authenticated, iss=<SUPABASE_URL>/auth/v1)
 * và gắn `request.user`. Hạn chế: chỉ HS256; project dùng khoá bất đối xứng (JWKS) cần bổ sung sau.
 * `request.user` chứa JWT thô: không log/serialize. Không tin claim `user_metadata` (user tự sửa được).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly key: Uint8Array;
  private readonly issuer: string;

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ENV) env: Env,
  ) {
    this.key = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);
    this.issuer = `${env.SUPABASE_URL.replace(/\/+$/, "")}/auth/v1`;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const header = request.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) throw new AppException(ERROR_CODES.UNAUTHENTICATED, "Missing access token");

    request.user = await this.verify(token);
    return true;
  }

  private async verify(token: string): Promise<AuthUser> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ["HS256"],
        audience: "authenticated",
        issuer: this.issuer,
      });
      const claims = payload as SupabaseClaims;
      if (!claims.sub) throw new Error("missing sub");
      return {
        id: claims.sub,
        email: claims.email ?? null,
        jwt: token,
      };
    } catch {
      // Không lộ lý do cụ thể (hết hạn / sai chữ ký) cho client.
      throw new AppException(ERROR_CODES.UNAUTHENTICATED, "Invalid or expired access token");
    }
  }
}
