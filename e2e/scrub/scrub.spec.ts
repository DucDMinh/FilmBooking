import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Kiểm chuyển động theo cuộn (AC-32, NFR-19; design-spec §16.4). Không cần DB: web build + mock API.
 * Chạy: `pnpm exec playwright test -c playwright.scrub.config.ts` (xem e2e/scrub/README.md).
 * Mọi giá trị đọc bằng getComputedStyle trong Chromium thật (CSS scroll-driven animations).
 */

const SIZES = [
  { name: "390x844", width: 390, height: 844 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1920x1080", width: 1920, height: 1080 },
] as const;

/** Mọi route khách (không cần đăng nhập). `/dat-ve/<suất>` lấy sơ đồ ghế từ mock. */
const GUEST_ROUTES = [
  "/",
  "/phim",
  "/phim/phim-1",
  "/rap",
  "/rap/SGN1",
  "/lich-chieu",
  "/lich-chieu?movie=phim-1",
  "/dat-ve/st-0-0-0",
  "/dang-nhap",
  "/dang-ky",
  "/quen-mat-khau",
  "/dieu-khoan",
  "/chinh-sach-bao-mat",
  "/khong-co-trang-nay",
];

/** Cookie tỉnh có sẵn để hộp chọn tỉnh (modal khoá cuộn) không tự mở; mock coi "ALL" là không lọc. */
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "fb_province", value: "ALL", url: process.env.SCRUB_WEB_URL ?? "http://localhost:3105" }]);
});

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    // Bỏ qua 2 nhiễu của môi trường kiểm: realtime tới Supabase giả (cổng không ai nghe) và 404 có chủ đích của trang không tồn tại.
    if (msg.type() === "error" && !/ws:\/\/127\.0\.0\.1:54399|status of 404/.test(msg.text())) errors.push(`console.error: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

/** Nhảy tới vị trí cuộn rồi đợi 2 frame để animation theo cuộn cập nhật. */
async function scrollToY(page: Page, y: number): Promise<void> {
  await page.evaluate(async (top) => {
    window.scrollTo({ top, behavior: "instant" });
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  }, y);
}

/** Cuộn dần (0.4 màn mỗi bước) tới cuối trang như người dùng thật, đợi frame sau mỗi bước. */
async function scrollToBottomGradually(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const frame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    const step = Math.max(120, Math.round(window.innerHeight * 0.4));
    for (let guard = 0; guard < 600; guard++) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (window.scrollY >= max - 1) break;
      window.scrollTo({ top: Math.min(max, window.scrollY + step), behavior: "instant" });
      await frame();
    }
    await frame();
    await frame();
  });
}

interface StuckItem {
  kind: string;
  selector: string;
  text: string;
  detail: string;
}

/** Phần tử scrub còn ẩn/cắt dở (opacity < 1, wipe/media clip, vạch scaleX < 1). `.hs-lead` mờ dần theo thiết kế hero. */
async function collectStuck(page: Page): Promise<StuckItem[]> {
  return page.evaluate(() => {
    const out: { kind: string; selector: string; text: string; detail: string }[] = [];
    const describe = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}.${String(el.className).trim().split(/\s+/).slice(0, 3).join(".")}`;
    const text = (el: Element) => (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
    const visible = (el: Element) => el.getClientRects().length > 0;
    for (const el of document.querySelectorAll("[data-scrub]")) {
      if (el.classList.contains("hs-lead") || !visible(el)) continue;
      const cs = getComputedStyle(el);
      if (parseFloat(cs.opacity) < 0.999) out.push({ kind: "opacity", selector: describe(el), text: text(el), detail: `opacity ${cs.opacity}` });
    }
    for (const el of document.querySelectorAll("[data-scrub-wipe], [data-scrub-media]")) {
      if (!visible(el)) continue;
      const clip = getComputedStyle(el).clipPath;
      if (clip.includes("100%")) out.push({ kind: "clip-path", selector: describe(el), text: text(el), detail: clip });
    }
    for (const el of document.querySelectorAll("[data-scrub-rule]")) {
      if (!visible(el)) continue;
      const t = getComputedStyle(el).transform;
      const scaleX = t === "none" ? 1 : parseFloat(t.replace(/matrix\(/, ""));
      if (scaleX < 0.999) out.push({ kind: "rule", selector: describe(el), text: "", detail: t });
    }
    return out;
  });
}

async function hasHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
}

// ---------------------------------------------------------------------------------------------
// (a) cuộn hết trang: không còn phần tử scrub kẹt ẩn, không scroll ngang (AC-32)
// ---------------------------------------------------------------------------------------------
for (const size of SIZES) {
  test(`(a) cuộn hết trang ${size.name}: không phần tử [data-scrub] nào kẹt ẩn, không scroll ngang, không lỗi console`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    const problems: string[] = [];
    for (const route of GUEST_ROUTES) {
      const errors = watchConsole(page);
      await page.goto(route, { waitUntil: "load" });
      await scrollToBottomGradually(page);
      const stuck = await collectStuck(page);
      for (const s of stuck) problems.push(`${route}: [${s.kind}] ${s.selector} "${s.text}" ${s.detail}`);
      if (await hasHorizontalScroll(page)) problems.push(`${route}: scroll ngang`);
      for (const e of errors) problems.push(`${route}: ${e}`);
      page.removeAllListeners("console");
      page.removeAllListeners("pageerror");
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });
}

// ---------------------------------------------------------------------------------------------
// (b) đảo ngược + (c) hiện muộn, trang chủ 1280x800
// ---------------------------------------------------------------------------------------------
interface Sample {
  y: number;
  top: number;
  opacity: number;
  scale: number;
  tx: number;
}

/** Cuộn từng bước `step` px từ `from` tới `to`, ghi computed của phần tử thứ `index` của `selector`. */
async function traceElement(page: Page, selector: string, index: number, from: number, to: number, step: number): Promise<Sample[]> {
  return page.evaluate(
    async ({ selector: sel, index: idx, from: a, to: b, step: s }) => {
      const frame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      const first = (v: string) => (v === "none" ? 0 : parseFloat(v));
      const samples: { y: number; top: number; opacity: number; scale: number; tx: number }[] = [];
      for (let y = a; s > 0 ? y <= b : y >= b; y += s) {
        window.scrollTo({ top: y, behavior: "instant" });
        await frame();
        const el = document.querySelectorAll(sel)[idx];
        if (!el) throw new Error(`không có phần tử ${sel}[${idx}]`);
        const cs = getComputedStyle(el);
        samples.push({
          y,
          top: el.getBoundingClientRect().top,
          opacity: parseFloat(cs.opacity),
          scale: cs.scale === "none" ? 1 : parseFloat(cs.scale),
          tx: first(cs.translate),
        });
      }
      return samples;
    },
    { selector, index, from, to, step },
  );
}

/**
 * Chỉ số (trong querySelectorAll) của thẻ phim đầu tiên ở HÀNG THỨ HAI (CR-016: hàng đầu không scrub nên các phép thử
 * "hiện muộn / thu về / ẩn trong vùng inset" phải dùng hàng thứ hai). Số cột thật tự suy ra từ bố cục.
 */
async function secondRowCardIndex(page: Page): Promise<number> {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[data-testid^="movie-card-"]'));
    const firstTop = Math.round(cards[0]?.getBoundingClientRect().top ?? 0);
    return cards.findIndex((c) => Math.round(c.getBoundingClientRect().top) > firstTop + 10);
  });
}

async function qfieldState(page: Page) {
  return page.evaluate(async () => {
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    const cs = getComputedStyle(document.querySelector(".qfield") as Element);
    return {
      opacity: parseFloat(cs.opacity),
      tx: cs.translate === "none" ? 0 : parseFloat(cs.translate),
      scale: cs.scale === "none" ? 1 : parseFloat(cs.scale),
    };
  });
}

test.describe("trang chủ 1280x800", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("(b) hero ghim 0 -> 90svh -> 0 trả đúng giá trị, lưới phim thu về khi cuộn ngược", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    const start = await qfieldState(page);
    expect(start.opacity).toBe(1);
    expect(start.tx).toBeCloseTo(-36, 0);
    expect(start.scale).toBeCloseTo(0.9, 2);

    await scrollToY(page, 720); // 90svh
    const end = await qfieldState(page);
    expect(end.opacity).toBe(1);
    expect(end.tx).toBeCloseTo(0, 0);
    expect(end.scale).toBeCloseTo(1, 2);

    await scrollToY(page, 0);
    const back = await qfieldState(page);
    expect(back).toEqual(start);

    const pin = await page.evaluate(() => getComputedStyle(document.querySelector(".hs-pin") as Element).position);
    expect(pin).toBe("sticky");

    // Thẻ phim HÀNG THỨ HAI hiện đủ rồi cuộn về đầu trang: phải thu về opacity 0 (đảo ngược), không kẹt hiện.
    // (Hàng đầu không scrub, CR-016: luôn opacity 1 kể cả khi cuộn về đầu trang, xem test (i).)
    const row2 = await secondRowCardIndex(page);
    expect(row2, "lưới phim phải có hàng thứ hai").toBeGreaterThan(0);
    const cardTop = await page.evaluate((idx) => (document.querySelectorAll('[data-testid^="movie-card-"]')[idx] as Element).getBoundingClientRect().top + window.scrollY, row2);
    await scrollToY(page, cardTop - 300);
    const shown = await traceElement(page, '[data-testid^="movie-card-"]', row2, cardTop - 300, cardTop - 300, 1);
    expect(shown[0]?.opacity).toBe(1);
    await scrollToY(page, 0);
    const hidden = await traceElement(page, '[data-testid^="movie-card-"]', row2, 0, 0, 1);
    expect(hidden[0]?.opacity).toBe(0);
  });

  test("(c) thẻ phim hiện muộn từ hàng 2: hàng 1 luôn hiện đủ; hàng 2 bắt đầu khi cách mép dưới >= 200px và hoàn tất khi còn cách mép dưới >= 200px", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    const layout = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('[data-testid^="movie-card-"]'));
      const tops = cards.map((c) => Math.round(c.getBoundingClientRect().top + window.scrollY));
      const rowTops = [...new Set(tops)];
      return { tops, rowTops, innerHeight: window.innerHeight, count: cards.length };
    });
    expect(layout.count).toBeGreaterThanOrEqual(8);
    expect(layout.rowTops.length).toBeGreaterThanOrEqual(2);
    const row1Indexes = layout.tops.map((t, i) => (t === layout.rowTops[0] ? i : -1)).filter((i) => i >= 0);
    const row2Indexes = layout.tops.map((t, i) => (t === layout.rowTops[1] ? i : -1)).filter((i) => i >= 0);
    const row2First = row2Indexes[0] ?? -1;
    expect(row2First).toBeGreaterThan(0);

    // Hàng 1 (CR-016, NFR-19): mọi thẻ luôn opacity 1, scale 1, translate 0 ở MỌI vị trí cuộn, kể cả khi còn nằm dưới khung nhìn.
    for (const idx of row1Indexes) {
      const traced = await traceElement(page, '[data-testid^="movie-card-"]', idx, 0, (layout.rowTops[0] ?? 0) + 200, 40);
      const moving = traced.filter((s) => s.opacity < 0.999 || Math.abs(s.scale - 1) > 0.002 || Math.abs(s.tx) > 0.5);
      expect(moving, `thẻ hàng 1 #${idx} không được scrub: ${JSON.stringify(moving.slice(0, 2))}`).toEqual([]);
    }

    // Thẻ hàng 2 cột 0: lần đầu opacity > 0.02.
    const from1 = Math.max(0, (layout.rowTops[1] ?? 0) - layout.innerHeight - 40);
    const t1 = await traceElement(page, '[data-testid^="movie-card-"]', row2First, from1, (layout.rowTops[1] ?? 0) + 200, 6);
    const begin = t1.find((s) => s.opacity > 0.02);
    expect(begin, "thẻ hàng 2 phải bắt đầu hiện").toBeTruthy();
    const beginGap = layout.innerHeight - (begin?.top ?? 0);
    { const note = { type: "bắt đầu hiện (hàng 2, cột 0)", description: `đỉnh thẻ cách mép dưới ${Math.round(beginGap)}px` }; test.info().annotations.push(note); console.log(`[${note.type}] ${note.description}`); }
    expect(beginGap).toBeGreaterThanOrEqual(200);

    // Mọi thẻ hàng 2: tới lúc hoàn tất (opacity 1, scale 1, translate 0) thì đỉnh thẻ còn cách mép dưới >= 200px.
    const gaps: string[] = [];
    for (const idx of row2Indexes) {
      const from = Math.max(0, (layout.rowTops[1] ?? 0) - layout.innerHeight - 40);
      const trace = await traceElement(page, '[data-testid^="movie-card-"]', idx, from, (layout.rowTops[1] ?? 0) + 200, 6);
      const done = trace.find((s) => s.opacity > 0.999 && Math.abs(s.scale - 1) < 0.002 && Math.abs(s.tx) < 0.5);
      expect(done, `thẻ hàng 2 #${idx} phải hoàn tất`).toBeTruthy();
      const gap = layout.innerHeight - (done?.top ?? 0);
      gaps.push(`#${idx}: ${Math.round(gap)}px`);
      expect(gap, `thẻ hàng 2 #${idx} hoàn tất khi cách mép dưới ${gap}px`).toBeGreaterThanOrEqual(200);
    }
    { const note = { type: "hoàn tất (hàng 2)", description: gaps.join(", ") }; test.info().annotations.push(note); console.log(`[${note.type}] ${note.description}`); }
  });
});

// ---------------------------------------------------------------------------------------------
// (i) CR-016 (NFR-19, AC-35): hàng dữ liệu đầu + tiêu đề phía trên luôn hiện đủ ở mọi vị trí cuộn, mọi cỡ màn
// ---------------------------------------------------------------------------------------------
/** Phần tử "hàng đầu": đánh dấu tay `[data-scrub-first]` + con ở hàng trên cùng (theo bố cục thật) của mỗi `[data-scrub-grid]`. */
const MARK_FIRST_ROW_SCRIPT = () => {
  const out = new Set<Element>(document.querySelectorAll("[data-scrub-first]"));
  for (const grid of document.querySelectorAll("[data-scrub-grid]")) {
    const kids = Array.from(grid.children).filter((c) => c.hasAttribute("data-scrub"));
    const tops = kids.map((c) => Math.round(c.getBoundingClientRect().top));
    const minTop = Math.min(...tops);
    kids.forEach((c, i) => {
      if (tops[i] === minTop) out.add(c);
    });
  }
  for (const el of document.querySelectorAll("[data-e2e-first]")) el.removeAttribute("data-e2e-first");
  for (const el of out) el.setAttribute("data-e2e-first", "");
  return out.size;
};

/** Cỡ màn của test (i): thêm 768x1024 để phủ khoảng 560-1023px (lưới phim 3 cột, lưới rạp 2 cột). */
const SIZES_I = [...SIZES, { name: "768x1024", width: 768, height: 1024 }] as const;

/** Route có hàng dữ liệu từ thứ hai trở đi ở mọi cỡ màn thử (fixture mock: 14 phim, 3 rạp, mỗi rạp nhiều suất). */
const ROUTES_WITH_LATER_ROWS = ["/", "/phim", "/rap/SGN1", "/phim/phim-1", "/lich-chieu", "/lich-chieu?cinema=SGN1"];

/**
 * Đánh dấu `data-e2e-deepest` lên phần tử scrub SÂU NHẤT không phải hàng đầu, nằm trong nội dung (không tính footer) và đang gắn
 * animation cuộn; trả đỉnh của nó, hoặc null nếu không có (hàng sau bị mất chuyển động). Tìm lại bằng thuộc tính vì ảnh tải xong
 * làm bố cục dịch chuyển nên không so khớp theo toạ độ.
 */
async function markDeepestLaterScrub(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    for (const el of document.querySelectorAll("[data-e2e-deepest]")) el.removeAttribute("data-e2e-deepest");
    const later = Array.from(document.querySelectorAll("[data-scrub]:not([data-e2e-first])")).filter(
      (el) => !el.closest("footer") && getComputedStyle(el).animationName.includes("scrubPop"),
    );
    if (later.length === 0) return null;
    const deepest = later.reduce((a, b) => (b.getBoundingClientRect().top > a.getBoundingClientRect().top ? b : a));
    deepest.setAttribute("data-e2e-deepest", "");
    return Math.round(deepest.getBoundingClientRect().top + window.scrollY);
  });
}

for (const size of SIZES_I) {
  test(`(i) hàng đầu không scrub ${size.name}: hiện đủ ở mọi vị trí cuộn (kể cả vừa vào khung nhìn và khi cuộn lên lại)`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    const problems: string[] = [];
    for (const route of ["/", "/phim", "/rap", "/rap/SGN1", "/phim/phim-1", "/lich-chieu"]) {
      await page.goto(route, { waitUntil: "load" });
      await page.evaluate(MARK_FIRST_ROW_SCRIPT);
      const tops = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-e2e-first]")).map((el) => Math.round(el.getBoundingClientRect().top + window.scrollY)),
      );
      if (tops.length === 0) problems.push(`${route}: không tìm thấy phần tử hàng đầu nào (kiểm thử rỗng)`);
      const positions = new Set<number>([0]);
      for (const top of tops) {
        for (const delta of [size.height + 40, size.height - 40, 300, 0]) positions.add(Math.max(0, top - delta));
      }
      const ordered = [...positions].sort((a, b) => b - a); // từ dưới lên: mô phỏng cuộn lên lại
      for (const y of [...ordered, ...[...ordered].reverse()]) {
        await scrollToY(page, y);
        const bad = await page.evaluate(() => {
          const out: string[] = [];
          for (const el of document.querySelectorAll("[data-e2e-first]")) {
            const cs = getComputedStyle(el);
            const tx = cs.translate === "none" ? "0" : cs.translate;
            const sc = cs.scale === "none" ? "1" : cs.scale;
            if (parseFloat(cs.opacity) < 0.999 || !/^(0(px)?\s?)+$/.test(tx) || Math.abs(parseFloat(sc) - 1) > 0.002) {
              out.push(`${el.tagName.toLowerCase()}[${el.getAttribute("data-scrub")}] opacity ${cs.opacity} translate ${cs.translate} scale ${cs.scale}`);
            }
            // Hàng đầu không còn animation nên clip-path của wipe/media phải là "none" (bắt cả trạng thái giữa chừng, không chỉ "100%").
            for (const inner of el.querySelectorAll("[data-scrub-wipe], [data-scrub-media]")) {
              const clip = getComputedStyle(inner).clipPath;
              if (clip !== "none") out.push(`clip ${clip}`);
            }
            for (const rule of el.querySelectorAll("[data-scrub-rule]")) {
              const t = getComputedStyle(rule).transform;
              if (t !== "none" && t !== "matrix(1, 0, 0, 1, 0, 0)") out.push(`rule ${t}`);
            }
            for (const beam of el.querySelectorAll("[data-scrub-beam]")) {
              if (parseFloat(getComputedStyle(beam).opacity) > 0.001) out.push(`beam opacity ${getComputedStyle(beam).opacity}`);
            }
          }
          return out;
        });
        for (const b of new Set(bad)) problems.push(`${route}@${y}: ${b}`);
      }
    }
    expect(problems.slice(0, 20), problems.slice(0, 20).join("\n")).toEqual([]);
  });

  test(`(i2) hàng sau VẪN scrub ${size.name}: có phần tử scrub không phải hàng đầu, ẩn khi vừa ló mép dưới và phần clip/tia quét chạy giữa chừng`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    const problems: string[] = [];
    let hiddenChecked = 0;
    for (const route of ROUTES_WITH_LATER_ROWS) {
      await page.goto(route, { waitUntil: "load" });
      await page.evaluate(MARK_FIRST_ROW_SCRIPT);
      const deepest = await markDeepestLaterScrub(page);
      if (deepest === null) {
        problems.push(`${route}: không có phần tử scrub nào ngoài hàng đầu (hàng sau bị mất chuyển động)`);
        continue;
      }
      // Phần tử sâu nhất: cuộn để đỉnh của nó nằm cách mép dưới 40px (trong vùng inset) thì phải đang ẩn một phần.
      const y = deepest - (size.height - 40);
      if (y < 0) continue; // phần tử đã nằm trọn trong màn hình lúc vào trang, không thể ép về vùng inset
      await scrollToY(page, y);
      const opacity = await page.evaluate(() => {
        const el = document.querySelector("[data-e2e-deepest]");
        return el ? parseFloat(getComputedStyle(el).opacity) : null;
      });
      hiddenChecked++;
      if (opacity === null || opacity >= 0.999) problems.push(`${route}: phần tử hàng sau sâu nhất (top ${deepest}) không bị ẩn khi ló mép dưới (opacity ${opacity})`);
    }
    expect(hiddenChecked, "phải có ít nhất 1 route kiểm được trạng thái ẩn của hàng sau").toBeGreaterThan(0);

    // Giữa chừng: thẻ phim hàng sau ở /phim có clip-path đang mở dở và tia quét đang chạy ở một vài vị trí cuộn.
    await page.goto("/phim", { waitUntil: "load" });
    await page.evaluate(MARK_FIRST_ROW_SCRIPT);
    const beamTop = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('[data-scrub="beam"]:not([data-e2e-first])'));
      const last = cards.at(-1);
      last?.setAttribute("data-e2e-beam", "");
      return last ? Math.round(last.getBoundingClientRect().top + window.scrollY) : -1;
    });
    if (beamTop < 0) problems.push("/phim: không có thẻ phim hàng sau");
    else {
      const from = Math.max(0, beamTop - size.height - 200);
      let sawPartialClip = false;
      let beamAnimation = "";
      let sawHalfOpacity = false;
      for (let y = from; y <= beamTop + 100; y += 12) {
        await scrollToY(page, y);
        const s = await page.evaluate(() => {
          const card = document.querySelector("[data-e2e-beam]");
          if (!card) return null;
          const media = card.querySelector("[data-scrub-media]");
          const beam = card.querySelector("[data-scrub-beam]");
          return {
            opacity: parseFloat(getComputedStyle(card).opacity),
            clip: media ? getComputedStyle(media).clipPath : "none",
            beamAnimation: beam ? getComputedStyle(beam).animationName : "",
          };
        });
        if (!s) continue;
        if (s.clip !== "none" && !s.clip.includes("100%") && s.opacity < 0.999) sawPartialClip = true;
        beamAnimation = s.beamAnimation;
        if (s.opacity > 0.01 && s.opacity < 0.99) sawHalfOpacity = true;
      }
      if (!sawPartialClip) problems.push("/phim: không thấy clip-path poster mở dở ở thẻ hàng sau");
      // Tia quét có timeline riêng rất ngắn (phần tử cao 3px) nên không lấy mẫu được giữa chừng; kiểm animation còn gắn vào thẻ hàng sau.
      if (!beamAnimation.includes("beamLine")) problems.push(`/phim: tia quét thẻ hàng sau mất animation (animation-name: ${beamAnimation})`);
      if (!sawHalfOpacity) problems.push("/phim: không thấy opacity trung gian ở thẻ hàng sau");
    }
    expect(problems.slice(0, 20), problems.slice(0, 20).join("\n")).toEqual([]);
  });
}

// M-1 hồi quy (reviewer round 1): trang có nhiều lịch xếp chồng chỉ khối ĐẦU của lịch đầu tiên được `first`.
test.describe("(i3) /lich-chieu: chỉ khối suất đầu tiên không scrub, các khối sau vẫn hiện dần (AC-35)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  for (const route of ["/lich-chieu", "/lich-chieu?cinema=SGN1", "/phim/phim-1"]) {
    test(route, async ({ page }) => {
      await page.goto(route, { waitUntil: "load" });
      const frames = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-scrub="ltr"].frame')).map((el) => ({
          first: el.hasAttribute("data-scrub-first"),
          animation: getComputedStyle(el).animationName,
        })),
      );
      expect(frames.length, `${route}: cần >= 2 khối suất để phân biệt hàng đầu và hàng sau`).toBeGreaterThanOrEqual(2);
      expect(frames[0]?.first).toBe(true);
      expect(frames[0]?.animation).toBe("none");
      for (const [index, frame] of frames.slice(1).entries()) {
        expect(frame.first, `${route}: khối thứ ${index + 2} không được đánh dấu first`).toBe(false);
        expect(frame.animation, `${route}: khối thứ ${index + 2} phải còn scrub`).toContain("scrubPop");
      }
    });
  }
});

// ---------------------------------------------------------------------------------------------
// (d) reduced motion: tất cả tĩnh, hero không ghim
// ---------------------------------------------------------------------------------------------
test("(d) prefers-reduced-motion: mọi [data-scrub] opacity 1, không translate/scale, hero không ghim", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const problems: string[] = [];
  for (const route of ["/", "/phim", "/rap", "/rap/SGN1", "/phim/phim-1", "/lich-chieu", "/dat-ve/st-0-0-0"]) {
    await page.goto(route, { waitUntil: "load" });
    for (const y of [0, 700]) {
      await scrollToY(page, y);
      const bad = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of document.querySelectorAll("[data-scrub]")) {
          const cs = getComputedStyle(el);
          const tx = cs.translate === "none" ? "0" : cs.translate;
          const sc = cs.scale === "none" ? "1" : cs.scale;
          if (parseFloat(cs.opacity) !== 1 || !/^(0(px)?\s?)+$/.test(tx) || parseFloat(sc) !== 1) out.push(`${el.tagName}.${el.className} opacity ${cs.opacity} translate ${cs.translate} scale ${cs.scale}`);
        }
        for (const el of document.querySelectorAll("[data-scrub-wipe], [data-scrub-media]")) {
          const clip = getComputedStyle(el).clipPath;
          if (clip !== "none" && clip.includes("100%")) out.push(`clip ${clip}`);
        }
        return out;
      });
      for (const b of bad) problems.push(`${route}@${y}: ${b}`);
    }
  }
  await page.goto("/", { waitUntil: "load" });
  const pin = await page.evaluate(() => getComputedStyle(document.querySelector(".hs-pin") as Element).position);
  if (pin === "sticky") problems.push(`hero vẫn ghim: ${pin}`);
  const qfield = await qfieldState(page);
  if (qfield.opacity !== 1 || qfield.tx !== 0 || qfield.scale !== 1) problems.push(`.qfield ${JSON.stringify(qfield)}`);
  expect(problems, problems.join("\n")).toEqual([]);
});

// ---------------------------------------------------------------------------------------------
// (e) focus bàn phím luôn thấy phần tử; không kẹt ở QuickBookBar
// ---------------------------------------------------------------------------------------------
test.describe("focus", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("(e) phần tử nhận focus trong vùng inset đáy hiện đủ (card + poster + vòng focus)", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    // Dùng thẻ ở hàng THỨ HAI: hàng đầu không scrub (CR-016) nên không bao giờ ẩn trong vùng inset.
    const row2 = await secondRowCardIndex(page);
    expect(row2, "lưới phim phải có hàng thứ hai").toBeGreaterThan(0);
    const cardTop = await page.evaluate((idx) => (document.querySelectorAll('[data-testid^="movie-card-"]')[idx] as Element).getBoundingClientRect().top + window.scrollY, row2);
    // Đặt thẻ hàng 2 nhô 120px ở mép đáy: nằm trong vùng inset (opacity 0).
    await scrollToY(page, cardTop - (800 - 120));
    const before = await page.evaluate((idx) => {
      const card = document.querySelectorAll('[data-testid^="movie-card-"]')[idx] as Element;
      return { opacity: parseFloat(getComputedStyle(card).opacity), top: card.getBoundingClientRect().top };
    }, row2);
    expect(before.opacity, "thẻ phải đang ẩn (trong vùng inset) trước khi focus").toBeLessThan(0.5);
    const after = await page.evaluate(async (idx) => {
      const card = document.querySelectorAll('[data-testid^="movie-card-"]')[idx] as Element;
      const link = card.querySelector("a") as HTMLElement;
      link.focus({ preventScroll: true });
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      const cs = getComputedStyle(card);
      const media = card.querySelector("[data-scrub-media]");
      const lcs = getComputedStyle(link);
      return {
        focused: document.activeElement === link,
        opacity: cs.opacity,
        translate: cs.translate,
        scale: cs.scale,
        mediaClip: media ? getComputedStyle(media).clipPath : "none",
        ring: `${lcs.boxShadow} | outline ${lcs.outlineStyle} ${lcs.outlineWidth}`,
        focusVisible: link.matches(":focus-visible"),
      };
    }, row2);
    expect(after.focused).toBe(true);
    expect(after.opacity).toBe("1");
    expect(after.mediaClip).toBe("none");
    { const note = { type: "focus trong vùng inset", description: JSON.stringify(after) }; test.info().annotations.push(note); console.log(`[${note.type}] ${note.description}`); }
  });

  test("(e) Tab thật qua lưới phim: thẻ nhận focus luôn opacity 1, vòng focus hiện", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    await page.getByRole("link", { name: /Xem tất cả phim/ }).focus();
    const seen: string[] = [];
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(async () => {
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        const active = document.activeElement as HTMLElement;
        const card = active.closest('[data-testid^="movie-card-"]');
        if (!card) return null;
        const media = card.querySelector("[data-scrub-media]");
        const cs = getComputedStyle(active);
        return {
          opacity: getComputedStyle(card).opacity,
          mediaClip: media ? getComputedStyle(media).clipPath : "none",
          gapFromBottom: Math.round(window.innerHeight - card.getBoundingClientRect().top),
          ring: cs.boxShadow !== "none" || (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.textDecorationLine.includes("underline"), // liên kết tiêu đề báo focus bằng đổi màu + gạch chân
          who: `${active.tagName.toLowerCase()}.${String(active.className).slice(0, 60)} shadow=${cs.boxShadow} outline=${cs.outlineStyle}/${cs.outlineWidth} fv=${active.matches(":focus-visible")}`,
        };
      });
      if (!info) continue;
      seen.push(`${info.gapFromBottom}px`);
      expect(info.opacity).toBe("1");
      expect(info.mediaClip).toBe("none");
      expect(info.ring, `thẻ nhận focus phải có vòng focus: ${info.who}`).toBe(true);
    }
    expect(seen.length).toBeGreaterThan(3);
    { const note = { type: "khoảng cách đỉnh thẻ tới mép dưới khi nhận focus", description: seen.join(", ") }; test.info().annotations.push(note); console.log(`[${note.type}] ${note.description}`); }
  });

  test("(e) Tab hết trang chủ khi chưa chọn tỉnh: không kẹt ở QuickBookBar, tới được chân trang", async ({ page, context }) => {
    await context.clearCookies();
    await page.goto("/", { waitUntil: "load" });
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    const trail: string[] = [];
    let reachedFooter = false;
    let reachedQbar = 0;
    let sameInARow = 0;
    for (let i = 0; i < 220 && !reachedFooter; i++) {
      await page.keyboard.press("Tab");
      const id = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        if (!el || el === document.body) return "body";
        const where = el.closest("footer") ? "footer" : el.closest(".qfield") ? "qbar" : el.closest("header") ? "header" : "main";
        return `${where}:${el.tagName.toLowerCase()}:${el.getAttribute("href") ?? el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 20) ?? ""}`;
      });
      sameInARow = id === trail[trail.length - 1] ? sameInARow + 1 : 0;
      expect(sameInARow, `Tab bị kẹt ở ${id}`).toBeLessThan(3);
      trail.push(id);
      if (id.startsWith("qbar:")) reachedQbar++;
      if (id.startsWith("footer:")) reachedFooter = true;
    }
    expect(reachedQbar, "Tab phải đi qua các ô QuickBookBar").toBeGreaterThanOrEqual(1);
    expect(reachedFooter, `chưa tới chân trang sau ${trail.length} lần Tab`).toBe(true);
    { const note = { type: "Tab tới chân trang", description: `${trail.length} lần Tab, ${reachedQbar} ô QuickBookBar` }; test.info().annotations.push(note); console.log(`[${note.type}] ${note.description}`); }
  });
});

// ---------------------------------------------------------------------------------------------
// (f) /dat-ve: hiện đủ ngay, ghế đã chọn không bị thu về
// ---------------------------------------------------------------------------------------------
for (const size of [SIZES[0], SIZES[1]]) {
  test(`(f) /dat-ve ${size.name}: phần tử trong khung nhìn hiện đủ ngay; ghế đang thấy không bị thu về khi cuộn lên xuống`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("/dat-ve/st-0-0-0", { waitUntil: "load" });
    const inView = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll("[data-scrub]")) {
        const r = el.getBoundingClientRect();
        if (r.bottom > 0 && r.top < window.innerHeight && el.getClientRects().length > 0) {
          const o = parseFloat(getComputedStyle(el).opacity);
          if (o < 0.999) out.push(`${el.tagName}.${el.className} opacity ${o}`);
        }
      }
      return out;
    });
    expect(inView, inView.join("\n")).toEqual([]);

    // Khách chưa đăng nhập thì bấm ghế chỉ mở hộp đăng nhập (không chọn được), nên không dựng được ghế "đã chọn" bằng mock.
    // Thay bằng điều kiện tương đương: lúc cuộn lên/xuống, mọi ghế đang nằm ở 75% trên của khung nhìn đều opacity 1 (không bị thu về).
    const seatsHidden = async (label: string) =>
      page.evaluate((where) => {
        const bad: string[] = [];
        for (const el of document.querySelectorAll("button[data-seat-id]")) {
          const r = el.getBoundingClientRect();
          if (r.bottom <= 0 || r.top >= window.innerHeight * 0.75) continue;
          let o = 1;
          for (let n: Element | null = el; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity);
          if (o < 0.999) bad.push(`${where}: ghế ${el.getAttribute("data-seat-id")} opacity ${o.toFixed(2)} tại top ${Math.round(r.top)}`);
        }
        return bad;
      }, label);
    const seatCount = await page.locator("button[data-seat-id]").count();
    expect(seatCount).toBeGreaterThan(50);
    const bad: string[] = [];
    for (const y of [0, 300, 600, 900, 600, 300, 0]) {
      await scrollToY(page, y);
      bad.push(...(await seatsHidden(`cuộn ${y}`)));
    }
    expect(bad, bad.join(" | ")).toEqual([]);
    const stuck = await (async () => {
      await scrollToBottomGradually(page);
      return collectStuck(page);
    })();
    expect(stuck, JSON.stringify(stuck)).toEqual([]);
  });
}

// ---------------------------------------------------------------------------------------------
// (b2) ngoại lệ NFR-19: khối lời dẫn hero mờ dần khi cuộn, nhưng hành động đặt vé luôn có mặt ở QuickBookBar
// ---------------------------------------------------------------------------------------------
test("(b2) hero: lời dẫn + CTA hero hiện ở đầu trang rồi mờ dần; QuickBookBar luôn opacity 1; hiện lại khi cuộn về; focus ép hiện", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/", { waitUntil: "load" });
  const state = () =>
    page.evaluate(() => {
      const cta = document.querySelector<HTMLElement>(".hs-cta a, .hs-cta button");
      const lead = document.querySelector<HTMLElement>(".hs-lead");
      const fields = [...document.querySelectorAll<HTMLElement>(".qfield, .qbar__cta")];
      const cs = (el: HTMLElement | null) => (el ? getComputedStyle(el) : null);
      return {
        ctaOpacity: cs(cta)?.opacity ?? "none",
        ctaVisibility: cs(cta)?.visibility ?? "none",
        leadOpacity: cs(lead)?.opacity ?? "none",
        fieldOpacities: fields.map((f) => parseFloat(getComputedStyle(f).opacity)),
      };
    });
  await scrollToY(page, 0);
  const top = await state();
  expect(top.ctaOpacity, "CTA hero hiện ở đầu trang").toBe("1");
  expect(top.ctaVisibility).toBe("visible");
  expect(top.fieldOpacities.length).toBeGreaterThanOrEqual(5);
  expect(top.fieldOpacities.every((o) => o === 1), "ô QuickBookBar opacity 1 ở đầu trang").toBe(true);

  await scrollToY(page, 720);
  const after = await state();
  expect(Number(after.leadOpacity), "lời dẫn mờ đi sau khi cuộn qua hero").toBeLessThan(0.05);
  expect(after.fieldOpacities.every((o) => o === 1), "ô QuickBookBar vẫn opacity 1 sau khi cuộn qua hero").toBe(true);

  await scrollToY(page, 0);
  const back = await state();
  expect(back.ctaOpacity, "CTA hero hiện lại khi cuộn về").toBe("1");

  // đang giữ focus thì luôn hiện: focus CTA ở đầu trang (lúc còn hiện), RỒI mới cuộn qua hero.
  // (Sau khi mờ hẳn, CTA là visibility:hidden nên không thể nhận focus: đúng thiết kế.)
  await scrollToY(page, 0);
  const focusedAtTop = await page.evaluate(() => {
    const cta = document.querySelector<HTMLElement>(".hs-cta a, .hs-cta button");
    cta?.focus({ preventScroll: true });
    return document.activeElement === cta;
  });
  expect(focusedAtTop, "CTA hero nhận focus được ở đầu trang").toBe(true);
  await scrollToY(page, 720);
  const forced = await page.evaluate(() => {
    const cta = document.querySelector<HTMLElement>(".hs-cta a, .hs-cta button");
    const lead = cta?.closest<HTMLElement>(".hs-lead") ?? null;
    return { stillFocused: document.activeElement === cta, opacity: lead ? getComputedStyle(lead).opacity : "none", visibility: lead ? getComputedStyle(lead).visibility : "none" };
  });
  expect(forced.opacity, "đang focus: khối lời dẫn ép hiện dù đã cuộn qua hero").toBe("1");
  expect(forced.visibility).toBe("visible");
});

// ---------------------------------------------------------------------------------------------
// (g) hero không bị cắt ở màn thấp; không lỗi console
// ---------------------------------------------------------------------------------------------
for (const size of [
  { width: 1366, height: 657 },
  { width: 1024, height: 690 },
]) {
  test(`(g) hero không bị cắt ở ${size.width}x${size.height} (tên phim dài)`, async ({ page }) => {
    await page.setViewportSize(size);
    const errors = watchConsole(page);
    await page.goto("/", { waitUntil: "load" });
    const box = await page.evaluate(() => {
      const pin = document.querySelector(".hs-pin") as HTMLElement;
      const p = pin.getBoundingClientRect();
      const rects = Array.from(pin.querySelectorAll(".hs-body > *, .hs-qbar-wrap")).map((el) => {
        const r = el.getBoundingClientRect();
        return { cls: String(el.className).split(" ")[0], top: r.top, bottom: r.bottom, left: r.left, right: r.right };
      });
      return {
        pin: { top: p.top, bottom: p.bottom },
        pinned: getComputedStyle(pin).position,
        title: (document.querySelector(".hs-title") as HTMLElement).innerText,
        rects,
        bodyTop: Math.min(...rects.map((r) => r.top)),
        bodyBottom: Math.max(...rects.map((r) => r.bottom)),
        innerHeight: window.innerHeight,
        innerWidth: window.innerWidth,
        rightMax: Math.max(...rects.map((r) => r.right)),
      };
    });
    expect(box.pinned).toBe("sticky");
    expect(box.bodyTop, `đầu nội dung hero ${box.bodyTop} nằm trên đỉnh pin ${box.pin.top}: ${JSON.stringify(box.rects)}`).toBeGreaterThanOrEqual(box.pin.top - 1);
    expect(box.bodyBottom, `đáy nội dung hero ${box.bodyBottom} vượt đáy khung nhìn ${box.innerHeight}: ${JSON.stringify(box.rects)}`).toBeLessThanOrEqual(box.innerHeight + 1);
    expect(box.rightMax).toBeLessThanOrEqual(box.innerWidth + 1);
    expect(await hasHorizontalScroll(page)).toBe(false);
    expect(errors).toEqual([]);
  });
}

// ---------------------------------------------------------------------------------------------
// (h) /admin và /staff không dùng scrub/scanline (kiểm mã nguồn: hai khu này cần đăng nhập nên mock không dựng được)
// ---------------------------------------------------------------------------------------------
test("(h) /admin và /staff không có [data-scrub], <Scrub>, .scanline trong mã nguồn", () => {
  const root = join(process.cwd(), "apps/web/src");
  const dirs = ["app/admin", "app/staff", "components/admin", "components/staff", "components/checkin"];
  const offenders: string[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name !== "__tests__") walk(full);
      } else if (/\.(tsx|ts|css)$/.test(name) && /data-scrub|<Scrub|ScrubGroup|scanline|motion\/scrub/.test(readFileSync(full, "utf8"))) {
        offenders.push(full);
      }
    }
  };
  for (const d of dirs) walk(join(root, d));
  expect(offenders).toEqual([]);
});

// ---------------------------------------------------------------------------------------------
// Hiệu năng: CLS < 0.1, LCP < 2.5s (PerformanceObserver; dữ liệu giả, mạng cục bộ)
// ---------------------------------------------------------------------------------------------
for (const size of [SIZES[1], SIZES[0]]) {
  test(`(perf) CLS < 0.1 và LCP < 2500ms ở ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: number; __lcp: number };
      w.__cls = 0;
      w.__lcp = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as (PerformanceEntry & { hadRecentInput?: boolean; value?: number })[]) {
          if (!e.hadRecentInput) w.__cls += e.value ?? 0;
        }
      }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((list) => {
        const last = list.getEntries().at(-1);
        if (last) w.__lcp = last.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    });
    const rows: string[] = [];
    for (const route of ["/", "/phim", "/lich-chieu"]) {
      await page.goto(route, { waitUntil: "load" });
      await page.waitForTimeout(1200);
      await scrollToBottomGradually(page);
      const m = await page.evaluate(() => {
        const w = window as unknown as { __cls: number; __lcp: number };
        return { cls: w.__cls, lcp: w.__lcp };
      });
      rows.push(`${route}: LCP ${Math.round(m.lcp)}ms, CLS ${m.cls.toFixed(4)}`);
      expect(m.lcp, `${route} LCP`).toBeLessThan(2500);
      expect(m.cls, `${route} CLS`).toBeLessThan(0.1);
    }
    { const note = { type: `đo ${size.name}`, description: rows.join(" | ") }; test.info().annotations.push(note); console.log(`[${note.type}] ${note.description}`); }
    console.log(`[perf ${size.name}] ${rows.join(" | ")}`);
  });
}

// ---------------------------------------------------------------------------------------------
// (a11y) Tab bàn phím: mọi phần tử nhận focus có dấu hiệu focus nhìn thấy (box-shadow inset, outline hoặc gạch chân)
// ---------------------------------------------------------------------------------------------
for (const route of ["/", "/dang-nhap", "/phim"]) {
  test(`(a11y) Tab ${route}: mọi phần tử nhận focus có vòng/dấu hiệu focus`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(route, { waitUntil: "load" });
    const missing: string[] = [];
    const kinds = new Map<string, number>();
    for (let i = 0; i < 45; i++) {
      await page.keyboard.press("Tab");
      const r = await page.evaluate(async () => {
        await new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => res())));
        const el = document.activeElement as HTMLElement;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const inner = el.querySelector("[class*=focus-within]");
        const kind = cs.boxShadow.includes("inset") ? "box-shadow inset" : cs.boxShadow !== "none" ? "box-shadow" : cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 ? "outline" : cs.textDecorationLine.includes("underline") ? "gạch chân" : "";
        return { who: `${el.tagName.toLowerCase()} ${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 24)}`, kind, parentRing: Boolean(inner) };
      });
      if (!r) continue;
      kinds.set(r.kind || "KHÔNG", (kinds.get(r.kind || "KHÔNG") ?? 0) + 1);
      // Ô nhập/lựa chọn đôi khi vẽ vòng focus ở khung cha (focus-within); chấp nhận khi phần tử có khung bao.
      if (!r.kind) missing.push(r.who);
    }
    console.log(`[a11y ${route}] ${[...kinds].map(([k, n]) => `${k}: ${n}`).join(", ")}`);
    expect(missing, `không có dấu hiệu focus: ${missing.join(" | ")}`).toEqual([]);
  });
}
