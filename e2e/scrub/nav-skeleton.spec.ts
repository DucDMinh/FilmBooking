import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

/**
 * Kiểm chứng end-to-end CR-016 (NFR-19, NFR-20, AC-32, AC-35): điều hướng hiện skeleton tức thì khi API chậm, lỗi API không kẹt
 * skeleton, hàng đầu hiện ngay + hàng sau vẫn scrub ở 4 cỡ màn, skeleton tắt animation khi reduced-motion, và HTTP status / noindex
 * theo user-agent cho mã phim/rạp sai (spec 3.6.1). Không cần DB: web build + mock API (xem e2e/scrub/README.md).
 *
 * Làm chậm / làm lỗi API qua `GET /__mock/config?delay=<ms>&fail=<status>` của mock-api.mjs (mặc định 0 = hành vi cũ).
 * Dữ liệu công khai được Next cache 60s (`PUBLIC_CACHE`) nên mỗi route "chậm" chỉ chậm ở LẦN ĐẦU gọi một khoá fetch: các test bên dưới
 * dùng cookie tỉnh / tham số riêng cho từng test để khoá fetch luôn "lạnh" và xác nhận độ chậm thật bằng thời điểm skeleton biến mất.
 */

const API_URL = `http://localhost:${process.env.SCRUB_API_PORT ?? 4010}`;
const WEB_URL = process.env.SCRUB_WEB_URL ?? "http://localhost:3105";
const SLOW_MS = 1500;
const SKELETON = '[role="status"][aria-busy="true"]';

async function setMock(request: APIRequestContext, delayMs: number, failStatus = 0): Promise<void> {
  const res = await request.get(`${API_URL}/__mock/config?delay=${delayMs}&fail=${failStatus}`);
  expect(res.ok(), "mock API phải nhận được cấu hình làm chậm/làm lỗi").toBe(true);
}

test.beforeEach(async ({ context, request }) => {
  await setMock(request, 0, 0);
  // Cookie tỉnh "ALL" để hộp chọn tỉnh không tự mở (cùng scrub.spec.ts); từng test có thể ghi đè bằng mã riêng để khoá cache riêng.
  await context.addCookies([{ name: "fb_province", value: "ALL", url: WEB_URL }]);
});

test.afterEach(async ({ request }) => {
  await setMock(request, 0, 0);
});

// ---------------------------------------------------------------------------------------------
// Bộ ghi: thời điểm URL đổi, skeleton hiện/biến mất tính từ lúc nhấn, và CLS trong lúc điều hướng
// ---------------------------------------------------------------------------------------------
interface NavRecord {
  t0: number | null;
  start: string;
  urlMs: number | null;
  skeletonMs: number | null;
  goneMs: number | null;
  clsCounted: number;
  clsAll: number;
  /** CLS của các layout-shift xảy ra SAU khi skeleton đã hiện 150ms, tức lúc thay skeleton bằng nội dung thật (không tính bước đổi trang cũ sang skeleton). */
  clsSwap: number;
}

async function armRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const rec: NavRecord = { t0: null, start: location.pathname + location.search, urlMs: null, skeletonMs: null, goneMs: null, clsCounted: 0, clsAll: 0, clsSwap: 0 };
    (window as unknown as { __nav: NavRecord }).__nav = rec;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { hadRecentInput?: boolean; value?: number })[]) {
        rec.clsAll += entry.value ?? 0;
        if (rec.t0 !== null && rec.skeletonMs !== null && entry.startTime - rec.t0 >= rec.skeletonMs + 150) rec.clsSwap += entry.value ?? 0;
        if (!entry.hadRecentInput) rec.clsCounted += entry.value ?? 0;
      }
    }).observe({ type: "layout-shift", buffered: false });
    // t0 = đúng lúc sự kiện click tới trang (không tính thời gian Playwright cuộn/di chuột trước khi nhấn).
    document.addEventListener("click", () => { rec.t0 = performance.now(); }, { capture: true, once: true });
    const tick = () => {
      if (rec.t0 !== null) {
        const ms = performance.now() - rec.t0;
        if (rec.urlMs === null && location.pathname + location.search !== rec.start) rec.urlMs = ms;
        const visible = document.querySelector('[role="status"][aria-busy="true"]') !== null;
        if (rec.skeletonMs === null && visible) rec.skeletonMs = ms;
        if (rec.skeletonMs !== null && rec.goneMs === null && !visible) rec.goneMs = ms;
      }
      if (rec.goneMs === null) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function readRecord(page: Page): Promise<NavRecord> {
  return page.evaluate(() => (window as unknown as { __nav: NavRecord }).__nav);
}

function headerLink(page: Page, label: string): Locator {
  return page.getByRole("navigation", { name: "Điều hướng chính" }).getByRole("link", { name: label, exact: true });
}

/** Chờ link vào khung nhìn rồi để Next kịp prefetch khung `loading.tsx` (như người dùng di chuột/đọc trang trước khi bấm). */
async function settleThenClick(link: Locator, page: Page): Promise<void> {
  await link.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  await link.click();
}

/**
 * Điều hướng phía client bằng `window.next.router.push` (như bấm một <Link>), kèm sự kiện click giả ngay trước để bộ ghi lấy mốc t0.
 * /rap và trang chủ đều gọi `/cinemas/<mã>?date=` của mọi rạp (cache 60s) nên /rap/<mã> chỉ "lạnh" khi xuất phát từ trang không gọi API rạp.
 */
async function routerPush(page: Page, href: string): Promise<void> {
  await page.waitForTimeout(1200);
  const ok = await page.evaluate((to) => {
    const router = (window as unknown as { next?: { router?: { push: (h: string) => void } } }).next?.router;
    if (!router) return false;
    document.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    router.push(to);
    return true;
  }, href);
  expect(ok, "window.next.router không có trong bản build production").toBe(true);
}

// ---------------------------------------------------------------------------------------------
// (1) Điều hướng tức thì khi API chậm (NFR-20, AC-35)
// ---------------------------------------------------------------------------------------------
interface NavCase {
  route: string;
  /** Trang xuất phát (đã tải xong, API nhanh). Trang chủ cache sẵn danh sách rạp nên /rap và /rap/<mã> xuất phát từ trang không gọi API đó. */
  start: string;
  /** Cookie tỉnh riêng để khoá fetch của /phim lạnh (cache 60s theo URL). */
  province: string;
  link: (page: Page) => Locator;
  /** Điều hướng bằng router của Next thay vì bấm link: dùng khi mọi trang có link tới route này đều đã gọi sẵn (và cache) API của nó. */
  viaRouter?: boolean;
  heading: string;
}

// Thứ tự có nghĩa: /rap (danh sách) gọi `/cinemas/<mã>?date=` của mọi rạp nên phải chạy SAU /rap/SGN1, nếu không khoá fetch của trang chi tiết đã nóng.
const NAV_CASES: NavCase[] = [
  { route: "/phim", start: "/", province: "NAVPHIM", link: (p) => headerLink(p, "Phim"), heading: "Khám phá phim chiếu rạp" },
  { route: "/lich-chieu", start: "/", province: "NAVLICH", link: (p) => headerLink(p, "Lịch chiếu"), heading: "Lịch chiếu phim" },
  { route: "/rap/SGN1", start: "/dieu-khoan", viaRouter: true, province: "NAVRAPCT", link: (p) => p.locator('a[href="/rap/SGN1"]').last(), heading: "CINEMO Quận 1" },
  { route: "/rap", start: "/dieu-khoan", province: "NAVRAP", link: (p) => headerLink(p, "Rạp"), heading: "Hệ thống rạp chiếu phim" },
  { route: "/phim/phim-1", start: "/", province: "NAVPHIMCT", link: (p) => p.locator('a[href="/phim/phim-1"]').last(), heading: "Đêm Neon Cuối Cùng" },
];

test.describe("(1) điều hướng tức thì với API chậm", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  for (const c of NAV_CASES) {
    test(`${c.route}: URL đổi và skeleton hiện trong <= 300ms, biến mất khi dữ liệu về, CLS < 0.1`, async ({ page, context, request }) => {
      await context.addCookies([{ name: "fb_province", value: c.province, url: WEB_URL }]);
      await page.goto(c.start, { waitUntil: "load" });
      await expect(page.locator(SKELETON)).toHaveCount(0);

      await setMock(request, SLOW_MS);
      await armRecorder(page);
      if (c.viaRouter) await routerPush(page, c.route);
      else await settleThenClick(c.link(page), page);

      await page.waitForFunction(() => (window as unknown as { __nav: NavRecord }).__nav.goneMs !== null, null, { timeout: 30_000 });
      await expect(page.getByRole("heading", { level: 1, name: c.heading })).toBeVisible();
      await page.waitForTimeout(700); // đợi PerformanceObserver nhả nốt các layout-shift sau lúc thay
      const rec = await readRecord(page);
      const note = `${c.route}: URL đổi sau ${rec.urlMs?.toFixed(0)}ms, skeleton hiện sau ${rec.skeletonMs?.toFixed(0)}ms, biến mất sau ${rec.goneMs?.toFixed(0)}ms, CLS ${rec.clsCounted.toFixed(4)} (tính cả shift sát lúc nhấn: ${rec.clsAll.toFixed(4)}; riêng lúc thay skeleton bằng nội dung: ${rec.clsSwap.toFixed(4)})`;
      test.info().annotations.push({ type: "đo", description: note });
      console.log(`[nav] ${note}`);

      expect(rec.urlMs, `${c.route}: URL phải đổi`).not.toBeNull();
      expect(rec.urlMs ?? Infinity, `${c.route}: URL đổi chậm ${rec.urlMs}ms`).toBeLessThanOrEqual(300);
      expect(rec.skeletonMs, `${c.route}: không thấy skeleton (role=status aria-busy=true)`).not.toBeNull();
      expect(rec.skeletonMs ?? Infinity, `${c.route}: skeleton hiện chậm ${rec.skeletonMs}ms`).toBeLessThanOrEqual(300);
      // Chứng minh API chậm thật sự chặn nội dung (nếu không, skeleton có thể chỉ chớp qua và phép đo vô nghĩa, vd khoá fetch đã nằm trong cache).
      expect(rec.goneMs ?? 0, `${c.route}: skeleton biến mất sau ${rec.goneMs}ms, API chậm ${SLOW_MS}ms không còn chặn (khoá cache nóng?)`).toBeGreaterThanOrEqual(SLOW_MS - 200);
      await expect(page.locator(SKELETON)).toHaveCount(0);
      expect(rec.clsCounted, `${c.route}: CLS`).toBeLessThan(0.1);
      expect(rec.clsSwap, `${c.route}: CLS lúc thay skeleton bằng nội dung`).toBeLessThan(0.1);
    });
  }
});

// ---------------------------------------------------------------------------------------------
// (2) Lỗi tải API (500): giữ trạng thái lỗi/rỗng hiện có của từng trang, không kẹt skeleton
// ---------------------------------------------------------------------------------------------
function dayOffset(days: number): string {
  return new Date(Date.now() + 7 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10);
}

interface ErrorCase {
  name: string;
  /** Mỗi ca dùng khoá fetch riêng (cookie/tham số/ngày khác nhau) vì dữ liệu 200 đã cache sẽ che mất lỗi. */
  url: string;
  province?: string;
  expected: string;
}

const ERROR_CASES: ErrorCase[] = [
  { name: "/phim", url: "/phim", province: "ERRPHIM", expected: "Không tìm thấy phim phù hợp" },
  { name: "/rap", url: "/rap?province=ERRRAP", expected: "Không tìm thấy rạp phù hợp" },
  { name: "/lich-chieu", url: "/lich-chieu?province=ERRLICH", expected: "Lịch chiếu phim" },
  { name: "/rap/<mã>", url: `/rap/SGN1?date=${dayOffset(2)}`, expected: "Không tìm thấy trang" },
  { name: "/phim/<slug>", url: `/phim/phim-1?date=${dayOffset(2)}&province=ERRCT`, expected: "Không tìm thấy trang" },
];

test.describe("(2) lỗi API 500: không kẹt skeleton", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  for (const c of ERROR_CASES) {
    test(`${c.name} (tải thẳng): skeleton biến mất và hiện trạng thái hiện có "${c.expected}"`, async ({ page, context, request }) => {
      if (c.province) await context.addCookies([{ name: "fb_province", value: c.province, url: WEB_URL }]);
      await setMock(request, 300, 500);
      await page.goto(c.url, { waitUntil: "load" });
      await expect(page.locator(SKELETON)).toHaveCount(0, { timeout: 15_000 });
      await expect(page.getByText(c.expected, { exact: false }).first()).toBeVisible();
      await page.waitForTimeout(1000);
      await expect(page.locator(SKELETON), `${c.name}: skeleton quay lại / kẹt sau lỗi`).toHaveCount(0);
      const heading = await page.getByRole("heading", { level: 1 }).first().innerText();
      test.info().annotations.push({ type: "trạng thái lỗi", description: `${c.name}: h1 "${heading}", thấy "${c.expected}"` });
      console.log(`[lỗi 500] ${c.name}: h1 "${heading}", thấy "${c.expected}"`);
    });
  }

  for (const c of NAV_CASES.filter((n) => n.route === "/phim" || n.route === "/lich-chieu")) {
    test(`${c.route} (điều hướng từ trang chủ): lỗi 500 thì skeleton rồi trạng thái hiện có, không kẹt`, async ({ page, context, request }) => {
      await context.addCookies([{ name: "fb_province", value: `ERR${c.province}`, url: WEB_URL }]);
      await page.goto("/", { waitUntil: "load" });
      await setMock(request, SLOW_MS, 500);
      await armRecorder(page);
      await settleThenClick(c.link(page), page);
      await page.waitForFunction(() => (window as unknown as { __nav: NavRecord }).__nav.goneMs !== null, null, { timeout: 30_000 });
      const rec = await readRecord(page);
      expect(rec.skeletonMs ?? Infinity, `${c.route}: skeleton phải hiện tức thì cả khi API sắp lỗi`).toBeLessThanOrEqual(300);
      await expect(page.getByRole("heading", { level: 1, name: c.heading })).toBeVisible();
      await page.waitForTimeout(800);
      await expect(page.locator(SKELETON)).toHaveCount(0);
      console.log(`[lỗi 500 điều hướng] ${c.route}: skeleton ${rec.skeletonMs?.toFixed(0)}ms -> biến mất ${rec.goneMs?.toFixed(0)}ms`);
    });
  }
});

// ---------------------------------------------------------------------------------------------
// (3) Hàng đầu hiện ngay + hàng sau vẫn scrub (và thu về khi cuộn lên), 4 cỡ màn
//     Bổ sung cho (i)/(i2)/(i3) của scrub.spec.ts: ở đây cuộn TỪNG BƯỚC NHỎ tới lúc phần tử vừa ló vào khung nhìn (không nhảy tới
//     vị trí chọn sẵn) và kiểm cả chiều cuộn lên của hàng sau.
// ---------------------------------------------------------------------------------------------
const SIZES = [
  { name: "390x844", width: 390, height: 844 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1920x1080", width: 1920, height: 1080 },
] as const;

test.describe("(3) hàng đầu hiện ngay khi vừa ló, hàng sau hiện dần theo cuộn xuống và thu về khi cuộn lên", () => {
  for (const size of SIZES) {
    test(`${size.name}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      const problems: string[] = [];
      for (const route of ["/", "/phim", "/rap"]) {
        await page.goto(route, { waitUntil: "load" });
        // Đánh dấu: hàng đầu = [data-scrub-first] + con ở hàng trên cùng của mỗi [data-scrub-grid]; "hàng sau" = phần tử scrub sâu nhất ngoài chân trang.
        const setup = await page.evaluate(() => {
          const first = new Set<Element>(document.querySelectorAll("[data-scrub-first]"));
          for (const grid of document.querySelectorAll("[data-scrub-grid]")) {
            const kids = Array.from(grid.children).filter((c) => c.hasAttribute("data-scrub"));
            const tops = kids.map((c) => Math.round(c.getBoundingClientRect().top));
            const minTop = Math.min(...tops);
            kids.forEach((c, i) => { if (tops[i] === minTop) first.add(c); });
          }
          for (const el of document.querySelectorAll("[data-nav-first], [data-nav-later]")) { el.removeAttribute("data-nav-first"); el.removeAttribute("data-nav-later"); }
          for (const el of first) el.setAttribute("data-nav-first", "");
          const later = Array.from(document.querySelectorAll("[data-scrub]:not([data-nav-first])")).filter(
            (el) => !el.closest("footer") && !el.closest("[data-nav-first]") && getComputedStyle(el).animationName.includes("scrubPop"),
          );
          const deepest = later.reduce<Element | null>((a, b) => (a === null || b.getBoundingClientRect().top > a.getBoundingClientRect().top ? b : a), null);
          deepest?.setAttribute("data-nav-later", "");
          return { first: first.size, later: deepest ? Math.round(deepest.getBoundingClientRect().top + window.scrollY) : -1 };
        });
        if (setup.first === 0) problems.push(`${route}: không có phần tử hàng đầu`);
        if (setup.later < 0) problems.push(`${route}: không có phần tử hàng sau còn scrub`);

        const sample = () =>
          page.evaluate(() => {
            const neutral = (el: Element) => {
              const cs = getComputedStyle(el);
              const tx = cs.translate === "none" ? "0" : cs.translate;
              const sc = cs.scale === "none" ? "1" : cs.scale;
              return parseFloat(cs.opacity) >= 0.999 && /^(0(px)?\s?)+$/.test(tx) && Math.abs(parseFloat(sc) - 1) <= 0.002;
            };
            const bad: string[] = [];
            for (const el of document.querySelectorAll("[data-nav-first]")) {
              if (!neutral(el)) bad.push(`${el.tagName.toLowerCase()}[${el.getAttribute("data-scrub")}] opacity ${getComputedStyle(el).opacity}`);
            }
            const laterEl = document.querySelector("[data-nav-later]");
            return { bad, laterOpacity: laterEl ? parseFloat(getComputedStyle(laterEl).opacity) : null, laterTop: laterEl ? laterEl.getBoundingClientRect().top : null };
          });

        // Cuộn xuống từng 40px tới cuối trang: hàng đầu luôn hiện đủ; ghi lại opacity của phần tử hàng sau để thấy nó đi từ ẩn tới hiện.
        const maxY = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
        let laterMin = 1;
        let laterMax = 0;
        for (let y = 0; y <= maxY; y += 40) {
          await page.evaluate(async (top) => {
            window.scrollTo({ top, behavior: "instant" });
            await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
          }, y);
          const s = await sample();
          for (const b of new Set(s.bad)) problems.push(`${route}@${y} (xuống): ${b}`);
          if (s.laterOpacity !== null && s.laterTop !== null && s.laterTop > 0 && s.laterTop < size.height) {
            laterMin = Math.min(laterMin, s.laterOpacity);
            laterMax = Math.max(laterMax, s.laterOpacity);
          }
        }
        if (setup.later >= 0 && setup.later > size.height) {
          // Phần tử hàng sau nằm ngoài màn hình lúc vào trang: khi nó đi qua khung nhìn phải có lúc ẩn (opacity < 1) và lúc hiện đủ.
          if (!(laterMin < 0.999)) problems.push(`${route}: phần tử hàng sau không có lúc nào ẩn khi đi qua khung nhìn (min opacity ${laterMin})`);
          if (!(laterMax > 0.999)) problems.push(`${route}: phần tử hàng sau không hiện đủ tại lúc nào (max opacity ${laterMax})`);
        }

        // Cuộn ngược về đầu trang: hàng đầu vẫn hiện đủ; phần tử hàng sau (đã nằm dưới khung nhìn) phải thu về, không kẹt hiện.
        for (let y = maxY; y >= 0; y -= 40) {
          await page.evaluate(async (top) => {
            window.scrollTo({ top, behavior: "instant" });
            await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
          }, y);
          const s = await sample();
          for (const b of new Set(s.bad)) problems.push(`${route}@${y} (lên): ${b}`);
        }
        const atTop = await sample();
        if (setup.later > size.height && atTop.laterOpacity !== null && atTop.laterOpacity >= 0.999) {
          problems.push(`${route}: cuộn lên đầu trang mà phần tử hàng sau (top ${setup.later}) vẫn opacity ${atTop.laterOpacity} (không thu về)`);
        }
        test.info().annotations.push({ type: `${route}`, description: `hàng đầu ${setup.first} phần tử; hàng sau opacity qua khung nhìn ${laterMin.toFixed(2)}..${laterMax.toFixed(2)}; về đầu trang ${atTop.laterOpacity}` });
        console.log(`[hàng đầu ${size.name} ${route}] ${setup.first} phần tử hàng đầu; hàng sau opacity ${laterMin.toFixed(2)}..${laterMax.toFixed(2)}; về đầu trang ${atTop.laterOpacity}`);
      }
      expect(problems.slice(0, 20), problems.slice(0, 20).join("\n")).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------------------------
// (4) reduced-motion: skeleton không có animation chạy, nội dung thật hiện đủ (AC-32)
// ---------------------------------------------------------------------------------------------
test.describe("(4) skeleton và prefers-reduced-motion", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  /** Bấm "Lịch chiếu" (route không cache) khi API chậm 3s và đọc animation của skeleton đang hiện. */
  async function inspectSkeleton(page: Page, request: APIRequestContext) {
    await page.goto("/", { waitUntil: "load" });
    await setMock(request, 3000);
    await settleThenClick(headerLink(page, "Lịch chiếu"), page);
    await page.waitForSelector(SKELETON, { timeout: 5000 });
    return page.evaluate((selector) => {
      const root = document.querySelector(selector) as HTMLElement;
      const all = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
      return {
        nodes: all.length,
        running: root.getAnimations({ subtree: true }).filter((a) => a.playState === "running").length,
        namedAnimations: all.filter((el) => getComputedStyle(el).animationName !== "none").length,
      };
    }, SKELETON);
  }

  test("đối chứng: không đặt reduced-motion thì skeleton CÓ animation chạy (để phép thử bên dưới không vô nghĩa)", async ({ page, request }) => {
    const s = await inspectSkeleton(page, request);
    console.log(`[skeleton, chuyển động bình thường] ${s.nodes} phần tử, ${s.running} animation đang chạy, ${s.namedAnimations} phần tử có animation-name`);
    expect(s.nodes).toBeGreaterThan(3);
    expect(s.running, "skeleton phải có shimmer khi cho phép chuyển động").toBeGreaterThan(0);
  });

  test("reduced-motion: skeleton không còn animation nào chạy; nội dung thật hiện đủ khi dữ liệu về", async ({ page, request }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const s = await inspectSkeleton(page, request);
    console.log(`[skeleton, reduced-motion] ${s.nodes} phần tử, ${s.running} animation đang chạy, ${s.namedAnimations} phần tử có animation-name`);
    expect(s.nodes).toBeGreaterThan(3);
    expect(s.running, "reduced-motion: không được có animation chạy trong skeleton").toBe(0);
    expect(s.namedAnimations, "reduced-motion: computed animation-name phải là none").toBe(0);

    await expect(page.locator(SKELETON)).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Lịch chiếu phim" })).toBeVisible();
    const hidden = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll("[data-scrub]")) {
        if (parseFloat(getComputedStyle(el).opacity) < 0.999) out.push(`${el.tagName}.${String(el.className).slice(0, 40)} opacity ${getComputedStyle(el).opacity}`);
      }
      return out;
    });
    expect(hidden, hidden.join("\n")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// (5) HTTP theo user-agent cho mã rạp / slug phim sai (spec 3.6.1: trình duyệt thường 200 + noindex, bot 404)
// ---------------------------------------------------------------------------------------------
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const GOOGLEBOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
// Nằm trong danh sách htmlLimitedBots mặc định của Next (chặn metadata, trả HTTP status thật); (đo thực tế: Bingbot cũng nhận 200, xem 5b).
const BINGBOT_UA = "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)";

interface HttpProbe {
  status: number;
  noindex: boolean;
  robots: string;
  /** Giao diện "Không tìm thấy trang" thật trong HTML (bỏ <script>: payload RSC của mọi trang đều chứa chuỗi này). */
  notFoundUi: boolean;
}

async function probe(request: APIRequestContext, path: string, userAgent: string): Promise<HttpProbe> {
  const res = await request.get(`${WEB_URL}${path}`, { headers: { "user-agent": userAgent }, maxRedirects: 0, failOnStatusCode: false });
  const html = await res.text();
  const robots = [...html.matchAll(/<meta[^>]*name="robots"[^>]*>/g)].map((m) => m[0]).join(" ");
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, "");
  return { status: res.status(), noindex: /noindex/i.test(robots), robots, notFoundUi: visible.includes("Không tìm thấy trang") };
}

function describeProbe(r: HttpProbe): string {
  return `${r.status}${r.noindex ? " noindex" : ""}${r.notFoundUi ? " +UI không tìm thấy" : ""}`;
}

const WRONG_PATHS = ["/rap/MA-RAP-SAI", "/phim/slug-phim-sai"] as const;

test("(5a) trình duyệt thường: mã rạp / slug phim sai nhận 200 + noindex + giao diện không tìm thấy", async ({ request }) => {
  const problems: string[] = [];
  for (const path of WRONG_PATHS) {
    const r = await probe(request, path, BROWSER_UA);
    console.log(`[http trình duyệt] ${path}: ${describeProbe(r)} robots=${r.robots || "(không có)"}`);
    test.info().annotations.push({ type: "HTTP trình duyệt", description: `${path}: ${describeProbe(r)}` });
    if (r.status !== 200) problems.push(`${path}: trình duyệt thường nhận ${r.status}, spec 3.6.1 nói 200 (khi có skeleton)`);
    if (!r.noindex) problems.push(`${path}: không có <meta robots noindex> (${r.robots || "không có thẻ robots"})`);
    if (!r.notFoundUi) problems.push(`${path}: không thấy giao diện "Không tìm thấy trang"`);
  }
  expect(problems, problems.join("\n")).toEqual([]);
});

// PHÁT HIỆN LỆCH SPEC (CR-016, builder phase-3-task-03): Next KHÔNG coi Googlebot là bot "htmlLimited" (Googlebot chạy được JS nên
// được stream metadata như trình duyệt), nên `notFound()` trong generateMetadata không đổi được status: Googlebot nhận 200 + noindex.
// Spec 3.6.1 viết "404 cho bot" nên kỳ vọng ở đây giữ nguyên là 404; `test.fail` chỉ ghi nhận lỗi đã biết để bộ kiểm không đỏ cố định
// và sẽ báo "unexpected pass" khi lỗi được sửa (lúc đó xoá dòng test.fail).
test("(5b) bot (Googlebot, Bingbot): mã rạp / slug phim sai nhận 404 (spec 3.6.1) [lỗi đã biết, test.fail]", async ({ request }) => {
  test.fail(true, "Bot nhận 200 + noindex thay vì 404 (đo ở Googlebot và Bingbot), xem ghi chú phía trên");
  const problems: string[] = [];
  for (const [who, ua] of [["Googlebot", GOOGLEBOT_UA], ["Bingbot", BINGBOT_UA]] as const) {
    for (const path of WRONG_PATHS) {
      const r = await probe(request, path, ua);
      console.log(`[http ${who}] ${path}: ${describeProbe(r)}`);
      test.info().annotations.push({ type: `HTTP ${who}`, description: `${path}: ${describeProbe(r)}` });
      if (r.status !== 404) problems.push(`${path}: ${who} nhận ${r.status}, spec 3.6.1 nói 404`);
    }
  }
  expect(problems, problems.join("\n")).toEqual([]);
});

test("(5c) rạp/phim còn mở: 200, không noindex (mọi UA); rạp đóng: 200 + noindex (R-137)", async ({ request }) => {
  const problems: string[] = [];
  const uas = [["trình duyệt", BROWSER_UA], ["Googlebot", GOOGLEBOT_UA], ["Bingbot", BINGBOT_UA]] as const;
  for (const [path, closed] of [["/rap/SGN1", false], ["/phim/phim-1", false], ["/rap/CLOSED1", true]] as const) {
    for (const [who, ua] of uas) {
      const r = await probe(request, path, ua);
      console.log(`[http ${who}] ${path}: ${describeProbe(r)}`);
      test.info().annotations.push({ type: `HTTP ${who}`, description: `${path}: ${describeProbe(r)}` });
      if (r.status !== 200) problems.push(`${path}: ${who} nhận ${r.status}, phải 200`);
      if (r.notFoundUi) problems.push(`${path}: ${who} thấy giao diện không tìm thấy`);
      if (closed && !r.noindex) problems.push(`${path}: ${who} không có noindex cho rạp đóng (${r.robots || "không có thẻ robots"})`);
      if (!closed && r.noindex) problems.push(`${path}: ${who} nhận noindex dù còn mở (${r.robots})`);
    }
  }
  expect(problems, problems.join("\n")).toEqual([]);
});
