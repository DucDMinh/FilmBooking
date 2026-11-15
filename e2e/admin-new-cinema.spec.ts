import { expect, test, type Page } from "@playwright/test";
import {
  adminClient,
  apiAs,
  createAdminUser,
  createMovie,
  createUser,
  E2E_CINEMA_CODE_PREFIX,
  E2E_PROVINCE_PREFIX,
  firstSeatIds,
  randomId,
} from "./support/data";
import { loginViaUi } from "./support/ui";

/**
 * Admin dựng rạp mới: rạp + phòng bằng form quản trị (UI), sơ đồ ghế / suất / giá bằng chính các endpoint
 * mà màn quản trị gọi. Trả về id suất đã mở bán ở rạp mới.
 */
async function adminBuildsSellableCinema(page: Page) {
  const admin = adminClient();
  const adminUser = await createAdminUser(admin);
  const movie = await createMovie(admin);
  const provinceName = `e2e tinh ${randomId()}`;
  const provinceCode = `${E2E_PROVINCE_PREFIX}${randomId().toUpperCase()}`;
  expect(
    (await admin.from("provinces").insert({ code: provinceCode, name: provinceName })).error,
  ).toBeNull();
  const cinemaCode = `${E2E_CINEMA_CODE_PREFIX}${randomId().toUpperCase()}`.slice(0, 10);
  const cinemaName = `e2e rap moi ${cinemaCode}`;

  await loginViaUi(page, adminUser, "/admin/rap/moi");
  await page.getByLabel("Tên rạp").fill(cinemaName);
  await page.getByLabel("Mã rạp").fill(cinemaCode);
  await page.getByRole("combobox", { name: "Tỉnh/thành" }).click();
  await page.getByRole("option", { name: provinceName }).click();
  await page.getByLabel("Địa chỉ").fill("1 Đường E2E");
  await page.getByRole("button", { name: "Tạo rạp" }).click();
  await expect(page).toHaveURL(/\/admin\/rap$/);
  const cinema = await admin.from("cinemas").select("id").eq("code", cinemaCode).single();
  expect(cinema.error).toBeNull();
  const cinemaId = cinema.data!.id as string;

  await page.goto(`/admin/rap/${cinemaId}/phong`);
  await page.getByRole("button", { name: /Thêm phòng/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tên phòng").fill("Phòng E2E");
  await dialog.getByLabel("2D", { exact: true }).check();
  await dialog.getByLabel("Số hàng (tối đa 26)").fill("2");
  await dialog.getByLabel("Số cột (tối đa 60)").fill("4");
  await dialog.getByRole("button", { name: "Lưu" }).click();
  await expect(dialog).toBeHidden();
  const room = await admin.from("rooms").select("id").eq("cinema_id", cinemaId).single();
  expect(room.error).toBeNull();
  const roomId = room.data!.id as string;

  const cells = ["A", "B"].flatMap((row) =>
    [1, 2, 3, 4].map((col) => ({ row, col, type: "standard" })),
  );
  await apiAs(adminUser, "PUT", `/cinemas/${cinemaId}/rooms/${roomId}/seats`, { cells });
  const startsAt = new Date(Date.now() + 48 * 3_600_000).toISOString();
  await apiAs(adminUser, "POST", `/cinemas/${cinemaId}/showtimes`, {
    roomId,
    movieId: movie.id,
    startsAt,
    format: "2D",
    languageMode: "SUBTITLED",
  });
  const showtime = await admin.from("showtimes").select("id").eq("cinema_id", cinemaId).single();
  expect(showtime.error).toBeNull();
  const showtimeId = showtime.data!.id as string;
  await apiAs(adminUser, "POST", "/price-rules", {
    scope: "SHOWTIME",
    showtimeId,
    seatType: "NORMAL",
    amount: 80000,
  });
  return { admin, cinemaName, showtimeId };
}

// AC-19 / R-38: thêm rạp = chỉ thêm dữ liệu; khách giữ được ghế ở rạp mới (không cần sửa code).
test("admin tạo rạp, phòng, sơ đồ, suất -> khách giữ được ghế (qua API giữ ghế)", async ({
  page,
}) => {
  const { admin, showtimeId } = await adminBuildsSellableCinema(page);
  const customer = await createUser(admin, "cust");
  const seatIds = await firstSeatIds(admin, showtimeId, 1);
  const hold = await apiAs<{ orderId: string }>(customer, "POST", "/bookings/holds", {
    showtimeId,
    seatIds,
  });
  expect(hold.orderId).toBeTruthy();
});

// Cùng kịch bản nhưng khách đi bằng UI chọn ghế tới màn xác nhận (dừng ở bước giữ ghế/xác nhận).
test("admin tạo rạp mới -> khách chọn ghế và sang màn xác nhận bằng UI", async ({
  page,
  browser,
}, testInfo) => {
  const { admin, cinemaName, showtimeId } = await adminBuildsSellableCinema(page);
  const customer = await createUser(admin, "cust");
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    viewport: testInfo.project.use.viewport,
    hasTouch: testInfo.project.use.hasTouch,
    isMobile: testInfo.project.use.isMobile,
    locale: testInfo.project.use.locale,
    timezoneId: testInfo.project.use.timezoneId,
  });
  try {
    const customerPage = await context.newPage();
    await loginViaUi(customerPage, customer, `/dat-ve/${showtimeId}`);
    await customerPage.getByRole("button", { name: /^Hàng A ghế 1,/ }).click();
    await customerPage.getByRole("button", { name: "Tiếp tục" }).click();
    await expect(customerPage).toHaveURL(/\/xac-nhan$/);
    await expect(customerPage.getByText(cinemaName).first()).toBeVisible();
  } finally {
    await context.close();
  }
});
