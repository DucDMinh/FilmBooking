import { expect, test } from "@playwright/test";
import {
  adminClient,
  createPricedShowtime,
  createUser,
  sendPayosSuccessWebhook,
} from "./support/data";
import { loginViaUi, stubPayosCheckout } from "./support/ui";

// R-38: đặt vé -> xác nhận đơn (AC-08) -> thanh toán PayOS (webhook mock) -> vé.
test("khách đặt vé, xác nhận đơn, thanh toán qua webhook mock và nhận vé", async ({ page }) => {
  const admin = adminClient();
  const customer = await createUser(admin, "cust");
  const showtime = await createPricedShowtime(admin);
  await stubPayosCheckout(page);

  await loginViaUi(page, customer, `/dat-ve/${showtime.id}`);
  await expect(page.getByRole("grid", { name: "Sơ đồ ghế" })).toBeVisible();

  await page.getByRole("button", { name: /^Hàng A ghế 1,/ }).click();
  await expect(page.getByRole("list", { name: "Danh sách ghế đã chọn" })).toContainText("A1");
  await page.getByRole("button", { name: "Tiếp tục" }).click();

  // AC-08: màn xác nhận đơn hiển thị rạp/suất/ghế và chặn thanh toán tới khi đồng ý điều khoản không hoàn vé.
  await expect(page).toHaveURL(/\/dat-ve\/don\/[0-9a-f-]+\/xac-nhan$/);
  const orderId = /\/don\/([0-9a-f-]+)\//.exec(page.url())![1]!;
  await expect(page.getByRole("heading", { name: "Xác nhận đơn hàng" })).toBeVisible();
  await expect(page.getByText(showtime.cinema.name).first()).toBeVisible();
  const payButton = page.getByRole("button", { name: /^Thanh toán / });
  await expect(payButton).toBeDisabled();
  await page.getByRole("checkbox", { name: /đồng ý điều kiện vé/i }).check();
  await expect(payButton).toBeEnabled();
  await payButton.click();
  await page.getByRole("button", { name: "Đồng ý và thanh toán" }).click();

  await expect(page).toHaveURL(/pay\.payos\.vn\/web\//);

  // PayOS báo đã thanh toán (webhook ký HMAC thật) -> màn kết quả hiện vé.
  await sendPayosSuccessWebhook(admin, orderId);
  await page.goto(`/dat-ve/don/${orderId}/ket-qua`);
  await expect(page.getByRole("heading", { name: "Đặt vé thành công" })).toBeVisible();

  const { data: order } = await admin
    .from("orders")
    .select("status, booking_code")
    .eq("id", orderId)
    .single();
  expect(order?.status).toBe("paid");
  await page.goto("/ve");
  await expect(page.getByText(order!.booking_code as string).first()).toBeVisible();
});
