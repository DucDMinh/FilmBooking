import { expect, test, type Page } from "@playwright/test";
import {
  adminClient,
  apiAs,
  createPricedShowtime,
  firstSeatIds,
  createStaffUser,
  createUser,
  sendPayosSuccessWebhook,
} from "./support/data";
import { loginViaUi, stubPayosCheckout } from "./support/ui";

const SOLO_ID = "c0000000-0000-0000-0000-000000000001";
const COUPLE_ID = "c0000000-0000-0000-0000-000000000002";
const SEED_COMBO_NAMES = ["Combo Solo", "Combo Couple", "Bắp Phô Mai", "Nước Ngọt 22oz"];

/** Cùng định dạng vi-VN của `formatVnd`: dấu chấm ngăn nghìn + ký hiệu ₫ (có thể cách bằng khoảng trắng đặc biệt). */
const vnd = (amount: number) => new RegExp(`${amount.toLocaleString("vi-VN").replace(/\./g, "\\.")}\\s*₫`);

async function clickStepper(page: Page, action: "Tăng" | "Giảm", comboName: string) {
  await page.getByRole("button", { name: `${action} số lượng ${comboName}`, exact: true }).click();
}

// CR-018: chọn combo tại màn xác nhận -> tổng tiền server tính lại -> thanh toán -> vé có combo -> staff thấy combo cần phát.
test("khách chọn combo bắp nước, thanh toán, vé hiện combo; staff soát vé thấy combo cần phát", async ({
  page,
}) => {
  const admin = adminClient();
  const customer = await createUser(admin, "cust");
  const showtime = await createPricedShowtime(admin);
  const staff = await createStaffUser(admin, showtime.cinema.id);
  await stubPayosCheckout(page);

  // Giá combo lấy từ DB (nguồn sự thật), không hardcode.
  const { data: seeded } = await admin
    .from("combos")
    .select("id, name, price_amount")
    .in("id", [SOLO_ID, COUPLE_ID]);
  const priceOf = (id: string) => Number(seeded?.find((c) => c.id === id)?.price_amount);
  const soloPrice = priceOf(SOLO_ID);
  const couplePrice = priceOf(COUPLE_ID);
  expect(soloPrice).toBeGreaterThan(0);
  expect(couplePrice).toBeGreaterThan(0);

  await loginViaUi(page, customer, `/dat-ve/${showtime.id}`);
  await page.getByRole("button", { name: /^Hàng A ghế 1,/ }).click();
  await page.getByRole("button", { name: "Tiếp tục" }).click();
  await expect(page).toHaveURL(/\/dat-ve\/don\/[0-9a-f-]+\/xac-nhan$/);
  const orderId = /\/don\/([0-9a-f-]+)\//.exec(page.url())![1]!;

  const { data: seats } = await admin.from("order_seats").select("price_amount").eq("order_id", orderId);
  const seatTotal = (seats ?? []).reduce((sum, s) => sum + Number(s.price_amount), 0);
  expect(seatTotal).toBeGreaterThan(0);

  // 1. Section combo hiện 4 combo seed; ảnh seed không tồn tại -> icon dự phòng, không còn <img> vỡ.
  const section = page.locator('section[aria-labelledby="concession-title"]');
  await expect(section.getByRole("heading", { name: "Bắp nước & Combo" })).toBeVisible();
  for (const name of SEED_COMBO_NAMES) await expect(section.getByText(name, { exact: true })).toBeVisible();
  await expect(section.locator("img")).toHaveCount(0);
  await expect(section.locator("svg.lucide-popcorn")).toHaveCount(SEED_COMBO_NAMES.length + 1); // 4 thẻ + icon tiêu đề

  // 2. Tăng/giảm: dòng PriceBreakdown + tổng do server trả về.
  const total = page.getByTestId("order-total");
  await expect(total).toContainText(vnd(seatTotal));
  await expect(page.getByRole("button", { name: "Giảm số lượng Combo Solo", exact: true })).toBeDisabled();
  await clickStepper(page, "Tăng", "Combo Solo");
  await expect(page.getByText("Combo Solo × 1")).toBeVisible();
  await clickStepper(page, "Tăng", "Combo Solo");
  await expect(page.getByText("Combo Solo × 2")).toBeVisible();
  await expect(total).toContainText(vnd(seatTotal + 2 * soloPrice));
  await clickStepper(page, "Giảm", "Combo Solo");
  await expect(page.getByText("Combo Solo × 1")).toBeVisible();
  await expect(total).toContainText(vnd(seatTotal + soloPrice));
  await clickStepper(page, "Tăng", "Combo Couple");
  await expect(page.getByText("Combo Couple × 1")).toBeVisible();
  const expectedTotal = seatTotal + soloPrice + couplePrice;
  await expect(total).toContainText(vnd(expectedTotal));
  await expect(page.getByRole("button", { name: /^Thanh toán / })).toContainText(vnd(expectedTotal));

  // Reload: combo đã lưu server-side, không mất.
  await page.reload();
  await expect(page.getByText("Combo Solo × 1")).toBeVisible();
  await expect(total).toContainText(vnd(expectedTotal));

  // 3. Thanh toán: số tiền đơn/payment = tổng có combo.
  await page.getByRole("checkbox", { name: /đồng ý điều kiện vé/i }).check();
  await page.getByRole("button", { name: /^Thanh toán / }).click();
  await page.getByRole("button", { name: "Đồng ý và thanh toán" }).click();
  await expect(page).toHaveURL(/pay\.payos\.vn\/web\//);
  const { data: payment } = await admin.from("payments").select("amount").eq("order_id", orderId).single();
  expect(Number(payment?.amount)).toBe(expectedTotal);
  await sendPayosSuccessWebhook(admin, orderId);

  await page.goto(`/dat-ve/don/${orderId}/ket-qua`);
  await expect(page.getByRole("heading", { name: "Đặt vé thành công" })).toBeVisible();
  await expect(page.getByText("Combo Solo × 1")).toBeVisible();
  await expect(page.getByText("Combo Couple × 1")).toBeVisible();
  await expect(page.getByText("Nhận bắp nước tại quầy bắp nước của rạp bằng mã QR hoặc mã vé này.")).toBeVisible();

  const { data: order } = await admin
    .from("orders")
    .select("status, booking_code, subtotal_amount, total_amount")
    .eq("id", orderId)
    .single();
  expect(order?.status).toBe("paid");
  expect(Number(order?.total_amount)).toBe(expectedTotal);
  const bookingCode = order!.booking_code as string;

  await page.goto(`/ve/${bookingCode}`);
  await expect(page.getByText("Combo Solo × 1")).toBeVisible();
  await expect(page.getByText("Nhận bắp nước tại quầy bắp nước của rạp")).toBeVisible();

  const { data: rows } = await admin
    .from("order_combos")
    .select("combo_id, quantity, unit_price, total_price")
    .eq("order_id", orderId);
  const byCombo = new Map((rows ?? []).map((r) => [r.combo_id as string, r]));
  expect(byCombo.size).toBe(2);
  expect(byCombo.get(SOLO_ID)).toMatchObject({ quantity: 1, unit_price: soloPrice, total_price: soloPrice });
  expect(byCombo.get(COUPLE_ID)).toMatchObject({ quantity: 1, unit_price: couplePrice, total_price: couplePrice });

  // 4. Staff quét mã vé: thấy combo cần phát. Suất đã bán vé không đổi giờ được, nên đặt thêm 1 đơn có combo qua API
  // trên suất sắp chiếu (10 phút, trong cửa sổ soát vé; rạp e2e override cutoff về 0 như checkin.spec).
  expect(
    (await admin.from("cinemas").update({ online_cutoff_minutes: 0 }).eq("id", showtime.cinema.id)).error,
  ).toBeNull();
  const soonShowtime = await createPricedShowtime(admin, { cinema: showtime.cinema, startsInHours: 10 / 60 });
  const [seatId] = await firstSeatIds(admin, soonShowtime.id, 1);
  const hold = await apiAs<{ orderId: string }>(customer, "POST", "/bookings/holds", {
    showtimeId: soonShowtime.id,
    seatIds: [seatId],
  });
  await apiAs(customer, "PUT", `/bookings/${hold.orderId}/combos`, { items: [{ comboId: SOLO_ID, quantity: 2 }] });
  await apiAs(customer, "POST", `/bookings/${hold.orderId}/consent`, {});
  await apiAs(customer, "POST", `/bookings/${hold.orderId}/payment`, {});
  await sendPayosSuccessWebhook(admin, hold.orderId);
  const { data: staffOrder } = await admin.from("orders").select("booking_code").eq("id", hold.orderId).single();
  const staffBookingCode = staffOrder!.booking_code as string;

  await page.context().clearCookies();
  await loginViaUi(page, staff, "/staff/chon-rap");
  await expect(page).toHaveURL(/\/staff\/soat-ve/);
  await page.getByLabel("Nhập mã vé").fill(staffBookingCode);
  await page.getByRole("button", { name: "Tra cứu vé" }).click();
  const result = page.getByRole("alert").filter({ hasText: "VÉ HỢP LỆ" });
  await expect(result).toBeVisible();
  await expect(result.getByText("Bắp nước & Combo cần phát")).toBeVisible();
  await expect(result.getByText("Combo Solo × 2")).toBeVisible();
});
