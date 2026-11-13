"use server";

import { cookies } from "next/headers";
import { checkPasswordPolicy, PASSWORD_ISSUE_MESSAGES } from "@filmbooking/shared/password-policy";

import { ApiError, apiFetch } from "@/lib/api/client";
import { REMEMBER_COOKIE_NAME } from "@/lib/supabase/cookie-options";
import { createServerSupabase } from "@/lib/supabase/server";

export interface ActionResult {
  success?: boolean;
  error?: string;
}

/**
 * Server action đăng xuất an toàn:
 * Huỷ phiên GoTrue và dọn dẹp triệt để mọi cookie HttpOnly `sb-*` trên trình duyệt.
 */
export async function signOutAction(): Promise<ActionResult> {
  try {
    const cookieStore = await cookies();
    const supabase = await createServerSupabase();
    await supabase.auth.signOut();

    for (const cookie of cookieStore.getAll()) {
      if (cookie.name.startsWith("sb-")) {
        cookieStore.delete(cookie.name);
      }
    }
    cookieStore.delete(REMEMBER_COOKIE_NAME);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Đăng xuất thất bại" };
  }
}

/**
 * Server action đổi mật khẩu an toàn:
 * 1. Kiểm tra chính sách mật khẩu (R-02: 8-72 ký tự, chữ hoa, thường, số).
 * 2. Xác thực mật khẩu hiện tại qua POST /auth/login để ngăn bypass lockout và rate limit.
 * 3. Cập nhật mật khẩu mới trên phiên server Supabase.
 * 4. Trả về thông báo lỗi thân thiện bằng tiếng Việt.
 */
export async function changePasswordAction(
  currentPassword: string,
  newPassword: string,
): Promise<ActionResult> {
  try {
    const issues = checkPasswordPolicy(newPassword);
    const firstIssue = issues[0];
    if (firstIssue) {
      return { error: PASSWORD_ISSUE_MESSAGES[firstIssue] };
    }

    if (currentPassword === newPassword) {
      return { error: "Mật khẩu mới không được trùng với mật khẩu hiện tại" };
    }

    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.email) {
      return { error: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." };
    }

    // Xác thực mật khẩu cũ qua POST /auth/login để bảo đảm lockout/rate limit
    try {
      await apiFetch("/auth/login", {
        method: "POST",
        json: {
          email: user.email,
          password: currentPassword,
        },
      });
    } catch (loginErr) {
      if (loginErr instanceof ApiError) {
        if (loginErr.code === "ACCOUNT_LOCKED") {
          return {
            error:
              "Đăng nhập bằng mật khẩu tạm khoá 15 phút do nhập sai nhiều lần. Vui lòng thử lại sau.",
          };
        }
        if (loginErr.status === 401 || loginErr.code === "UNAUTHENTICATED") {
          return { error: "Mật khẩu hiện tại không chính xác. Vui lòng kiểm tra lại." };
        }
        return { error: loginErr.message };
      }
      return { error: "Mật khẩu hiện tại không chính xác. Vui lòng kiểm tra lại." };
    }

    // Cập nhật mật khẩu mới trên phiên server
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      return { error: "Không thể cập nhật mật khẩu mới. Vui lòng thử lại sau." };
    }

    return { success: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Đã có lỗi xảy ra khi đổi mật khẩu.",
    };
  }
}
