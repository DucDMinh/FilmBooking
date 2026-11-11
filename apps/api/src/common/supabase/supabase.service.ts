import { Inject, Injectable } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ERROR_CODES } from "@filmbooking/shared";
import { ENV, type Env } from "../../config/env";
import { AppException } from "../errors/app-exception";

const STATELESS_AUTH = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

@Injectable()
export class SupabaseService {
  private adminClient?: SupabaseClient;

  constructor(@Inject(ENV) private readonly env: Env) {}

  /**
   * Client mang JWT của user + ANON key -> RLS vẫn áp dụng theo user/rạp.
   * Mặc định dùng cái này; KHÔNG BAO GIỜ nhận service role key.
   */
  forUser(jwt: string): SupabaseClient {
    if (!jwt) throw new AppException(ERROR_CODES.UNAUTHENTICATED, "Missing access token");
    return createClient(this.env.SUPABASE_URL, this.env.SUPABASE_ANON_KEY, {
      auth: STATELESS_AUTH,
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
  }

  /**
   * Service role: BỎ QUA RLS. Chỉ gọi từ webhook PayOS, job, API POS (đã xác thực khóa)
   * và tác vụ admin đã kiểm quyền ở Nest. Không bao giờ trả client này ra ngoài API.
   */
  admin(): SupabaseClient {
    this.adminClient ??= createClient(this.env.SUPABASE_URL, this.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: STATELESS_AUTH,
    });
    return this.adminClient;
  }
}
