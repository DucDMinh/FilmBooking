import { expect, type Page } from "@playwright/test";
import type { E2eUser } from "./data";

// API giới hạn đăng nhập 10 lần/phút/IP (R-08, cửa sổ cố định + mỗi lần đăng nhập UI có thể tính nhiều hơn 1); mọi spec cùng IP localhost nên tự giãn nhịp để không tự chặn mình.
const LOGIN_LIMIT_PER_MINUTE = 5;
const loginTimestamps: number[] = [];

async function waitForLoginSlot(): Promise<void> {
  const windowMs = 65_000;
  for (;;) {
    const now = Date.now();
    while (loginTimestamps.length > 0 && now - loginTimestamps[0]! >= windowMs)
      loginTimestamps.shift();
    if (loginTimestamps.length < LOGIN_LIMIT_PER_MINUTE) break;
    await new Promise((resolve) =>
      setTimeout(resolve, windowMs - (now - loginTimestamps[0]!) + 100),
    );
  }
  loginTimestamps.push(Date.now());
}

/** Đăng nhập bằng form thật (/dang-nhap); chờ rời khỏi trang đăng nhập (web chuyển hướng cứng sau khi API trả phiên). */
export async function loginViaUi(page: Page, user: E2eUser, next = "/"): Promise<void> {
  await waitForLoginSlot();
  await page.goto(`/dang-nhap?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).not.toHaveURL(/\/dang-nhap/);
}

/** PayOS thật nằm ngoài hệ thống: chặn điều hướng sang trang thanh toán và trả trang giả, không gọi mạng. */
export async function stubPayosCheckout(page: Page): Promise<void> {
  await page.route(/^https:\/\/pay\.payos\.vn\//, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>PayOS mock</title><p>PayOS mock checkout</p>",
    }),
  );
}
