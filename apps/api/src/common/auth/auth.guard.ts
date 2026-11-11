import { Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ERROR_CODES } from "@filmbooking/shared";
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTVerifyGetKey } from "jose";
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

const ASYMMETRIC_ALGORITHMS = ["RS256", "ES256"];

/**
 * Xác thực JWT Supabase (aud=authenticated, iss=SUPABASE_JWT_ISSUER hoặc <SUPABASE_URL>/auth/v1)
 * và gắn `request.user`. Thuật toán chọn theo header `alg`: HS256 -> SUPABASE_JWT_SECRET;
 * RS256/ES256 -> JWKS từ SUPABASE_JWKS_URL (jose tự cache + refetch khi gặp kid mới). Alg khác (kể cả none) bị từ chối.
 * `request.user` chứa JWT thô: không log/serialize. Không tin claim `user_metadata` (user tự sửa được).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly secretKey?: Uint8Array;
  private readonly jwks?: JWTVerifyGetKey;
  private readonly issuer: string;

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ENV) env: Env,
  ) {
    this.secretKey = env.SUPABASE_JWT_SECRET ? new TextEncoder().encode(env.SUPABASE_JWT_SECRET) : undefined;
    this.jwks = env.SUPABASE_JWKS_URL ? createRemoteJWKSet(new URL(env.SUPABASE_JWKS_URL)) : undefined;
    this.issuer = env.SUPABASE_JWT_ISSUER ?? `${env.SUPABASE_URL.replace(/\/+$/, "")}/auth/v1`;
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
      const { alg } = decodeProtectedHeader(token);
      const options = { audience: "authenticated", issuer: this.issuer };
      let payload;
      if (alg === "HS256" && this.secretKey) {
        ({ payload } = await jwtVerify(token, this.secretKey, { ...options, algorithms: ["HS256"] }));
      } else if (alg && ASYMMETRIC_ALGORITHMS.includes(alg) && this.jwks) {
        ({ payload } = await jwtVerify(token, this.jwks, { ...options, algorithms: ASYMMETRIC_ALGORITHMS }));
      } else {
        throw new Error("unsupported alg");
      }
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
