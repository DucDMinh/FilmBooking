import { expect, test } from "@playwright/test";
import {
  adminClient,
  bookPaidOrder,
  createPricedShowtime,
  createStaffUser,
  createUser,
} from "./support/data";
import { loginViaUi } from "./support/ui";

// Staff vào rạp làm việc (chỉ được gán 1 rạp nên web tự chọn, bỏ qua màn chọn rạp) -> nhập mã vé -> VÉ HỢP LỆ; quét lại -> VÉ ĐÃ SỬ DỤNG.
test("staff soát vé: hợp lệ rồi đã sử dụng", async ({ page }) => {
  const admin = adminClient();
  const showtime = await createPricedShowtime(admin, { startsInHours: 10 / 60 });
  // Mặc định chuỗi đóng bán online 15 phút trước giờ chiếu; rạp e2e override về 0 để bán được suất sắp chiếu.
  expect(
    (await admin.from("cinemas").update({ online_cutoff_minutes: 0 }).eq("id", showtime.cinema.id))
      .error,
  ).toBeNull();
  const customer = await createUser(admin, "cust");
  const staff = await createStaffUser(admin, showtime.cinema.id);
  // Suất bắt đầu sau 10 phút: nằm trong cửa sổ soát vé (từ 30 phút trước giờ chiếu).
  const { bookingCode } = await bookPaidOrder(admin, customer, showtime.id);

  await loginViaUi(page, staff, "/staff/chon-rap");
  await expect(page).toHaveURL(/\/staff\/soat-ve/);
  await expect(page.getByText(`Đang làm việc tại ${showtime.cinema.name}`)).toBeVisible();

  await page.getByLabel("Nhập mã vé").fill(bookingCode);
  await page.getByRole("button", { name: "Tra cứu vé" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "VÉ HỢP LỆ" })).toBeVisible();
  await page.getByRole("button", { name: "Quét vé khác" }).click();

  await page.getByLabel("Nhập mã vé").fill(bookingCode);
  await page.getByRole("button", { name: "Tra cứu vé" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "VÉ ĐÃ SỬ DỤNG" })).toBeVisible();
});
