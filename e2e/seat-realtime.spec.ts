import { expect, test } from "@playwright/test";
import { adminClient, createPricedShowtime, createUser } from "./support/data";
import { loginViaUi } from "./support/ui";

const REALTIME_BUDGET_MS = 2000; // R-60 / NFR-03

// Khách A giữ ghế -> khách B (phiên trình duyệt riêng) thấy ghế "đang giữ" trong <= 2s mà không tải lại trang.
test("realtime: ghế khách A giữ hiện trạng thái đang giữ ở khách B trong 2s", async ({
  browser,
}, testInfo) => {
  const admin = adminClient();
  const showtime = await createPricedShowtime(admin);
  const [userA, userB] = await Promise.all([createUser(admin, "a"), createUser(admin, "b")]);
  const seat = await admin
    .from("seats")
    .select("id")
    .eq("cinema_id", showtime.cinema.id)
    .eq("row_label", "A")
    .eq("col_number", 1)
    .single();
  expect(seat.error).toBeNull();

  const { project } = testInfo;
  const contextOptions = {
    baseURL: project.use.baseURL,
    viewport: project.use.viewport,
    hasTouch: project.use.hasTouch,
    isMobile: project.use.isMobile,
    locale: project.use.locale,
    timezoneId: project.use.timezoneId,
  };
  const contextA = await browser.newContext(contextOptions);
  const contextB = await browser.newContext(contextOptions);
  try {
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    const target = `/dat-ve/${showtime.id}`;

    // Tín hiệu thật: kênh Realtime của B đã join xong (phx_reply status ok trên topic realtime:*) trước khi A giữ ghế.
    const channelJoinedOnB = new Promise<void>((resolve) => {
      pageB.on("websocket", (socket) => {
        socket.on("framereceived", ({ payload }) => {
          const frame = typeof payload === "string" ? payload : payload.toString();
          if (/phx_reply/.test(frame) && /"status":"ok"/.test(frame) && /realtime:/.test(frame))
            resolve();
        });
      });
    });
    await loginViaUi(pageA, userA, target);
    await loginViaUi(pageB, userB, target);

    const seatOnB = pageB.locator(`[data-seat-id="${seat.data!.id}"]`);
    await expect(seatOnB).toHaveAttribute("data-state", "free");
    await channelJoinedOnB;

    // A chọn ghế và bấm "Tiếp tục" như khách thật (gọi POST /bookings/holds). Bấm giờ ngay trước cú click giữ ghế
    // và dừng khi B thấy ghế "held" => mốc R-60 là giữ ghế -> Realtime -> UI của B.
    await pageA.getByRole("button", { name: /^Hàng A ghế 1,/ }).click();
    const continueButton = pageA.getByRole("button", { name: "Tiếp tục" });
    await expect(continueButton).toBeEnabled();
    const startedAt = Date.now();
    await continueButton.click();
    await expect(seatOnB).toHaveAttribute("data-state", "held", { timeout: REALTIME_BUDGET_MS });
    const elapsedMs = Date.now() - startedAt;
    console.log(
      `[R-60/NFR-03] ${testInfo.project.name}: realtime A->B = ${elapsedMs} ms (ngưỡng ${REALTIME_BUDGET_MS} ms)`,
    );
    testInfo.annotations.push({ type: "realtime-ms", description: String(elapsedMs) });
    expect(elapsedMs).toBeLessThanOrEqual(REALTIME_BUDGET_MS);
    await expect(seatOnB).toHaveAccessibleName(/đang giữ/i);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
