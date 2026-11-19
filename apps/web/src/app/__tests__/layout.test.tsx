import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { cn } from "@/lib/utils";

import ErrorPage from "../error";
import GlobalError from "../global-error";
import ForbiddenPage from "../khong-co-quyen/page";
import RootLayout from "../layout";
import NotFound from "../not-found";

// next/font/google chỉ chạy được qua SWC của Next; trong vitest phải giả lập.
vi.mock("next/font/google", () => ({
  // global-error vẫn tự nạp Inter (ngoài phạm vi task re-skin nền tảng).
  Inter: () => ({ variable: "inter-var", className: "inter-class" }),
  Chakra_Petch: () => ({ variable: "chakra-var", className: "chakra-class" }),
  Be_Vietnam_Pro: () => ({ variable: "be-vietnam-var", className: "be-vietnam-class" }),
  JetBrains_Mono: () => ({ variable: "jetbrains-var", className: "jetbrains-class" }),
  Orbitron: () => ({ variable: "orbitron-var", className: "orbitron-class" }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("RootLayout", () => {
  const html = renderToStaticMarkup(
    <RootLayout>
      <p>nội dung trang</p>
    </RootLayout>,
  );

  it("đặt lang=vi, nạp đủ 4 biến font CYBERPLEX (không còn Inter) và render children", () => {
    expect(html).toContain('<html lang="vi"');
    for (const variable of ["chakra-var", "be-vietnam-var", "jetbrains-var", "orbitron-var"]) {
      expect(html).toContain(variable);
    }
    expect(html).not.toContain("inter-var");
    expect(html).toContain("nội dung trang");
  });

  it("chỉ dark (D1): không class .dark, không nút đổi theme", () => {
    expect(html).not.toMatch(/class="[^"]*\bdark\b/);
    expect(html.toLowerCase()).not.toContain("theme-toggle");
  });
});

describe("globals.css", () => {
  const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

  it("khai báo token CYBERPLEX chính (tên token giữ nguyên) và color-scheme dark", () => {
    expect(css).toContain("color-scheme: dark");
    expect(css).toContain("--color-bg: #070709");
    expect(css).toContain("--color-brand: #FCEE09");
    expect(css).toContain("--color-fg-on-brand: #07070A");
    expect(css).toContain("--color-border-input: #6E6E86");
    expect(css).toContain("--color-danger-text: #FF4D6D");
    expect(css).toContain("--radius-lg: 0px");
    expect(css).toContain("--radius: 0px");
    expect(css).toContain("--shadow-overlay: 0 14px 40px rgb(0 0 0 / 0.6)");
    expect(css).not.toContain("--shadow-cta-glow");
  });

  it("chamfer: 3 cỡ cắt + clip-path tương ứng (design-tokens §3.1)", () => {
    expect(css).toContain("--cut-lg: 24px");
    expect(css).toContain("--cut-md: 12px");
    expect(css).toContain("--cut-sm: 7px");
    expect(css).toMatch(/@utility chamfer-lg \{ clip-path: var\(--clip-card\); \}/);
    expect(css).toMatch(/@utility chamfer-md \{ clip-path: var\(--clip-btn\); \}/);
    expect(css).toMatch(/@utility chamfer-sm \{ clip-path: var\(--clip-chip\); \}/);
  });

  it("scrub CSS: không JS, bọc reduced-motion + @supports, tắt khi in, không glitch (AC-32, NFR-19)", () => {
    expect(css).toContain("--scrub-inset: min(36%, 300px)");
    expect(css).toMatch(/@utility scrub-inset-0 \{ --scrub-inset: 0px; \}/);
    for (const keyframe of ["scrubPop", "wipeIn", "drawX", "beamOpen", "beamLine"]) {
      expect(css).toContain(`@keyframes ${keyframe}`);
    }
    expect(css).not.toMatch(/@keyframes\s+glitch/i);
    // Một "*/" lọt vào giữa comment làm CSS sau đó hỏng cú pháp và Tailwind lặng lẽ bỏ @keyframes scrubPop.
    expect(css.split("*/").length).toBe(css.split("/*").length);
    // Toàn bộ quy tắc gắn timeline phải nằm sau cổng reduced-motion + @supports (nội dung tĩnh khi ngoài điều kiện).
    const gateStart = css.indexOf("@media (prefers-reduced-motion: no-preference)");
    const gated = css.slice(gateStart, css.indexOf("@media print"));
    expect(gated).toContain("@supports (animation-timeline: view())");
    expect(gated.indexOf("@supports")).toBeLessThan(gated.indexOf("animation-timeline: var(--tl"));
    expect(css.slice(0, gateStart)).not.toContain("animation-timeline");
    expect(gated).toContain("[data-scrub-group]");
    expect(gated).toContain("animation-name: scrubPop");
    expect(gated).toContain("[data-scrub]:focus-within { animation: none; opacity: 1; translate: 0 0; scale: 1; }");
    expect(css).toMatch(/@media print\s*\{[^}]*animation: none !important/);
  });

  it("focus (T7): phần tử clip-path dùng vòng inset, phần tử thường dùng outline", () => {
    expect(css).toMatch(/:focus-visible \{ outline: 2px solid var\(--color-brand\)/);
    expect(css).toMatch(/\.chamfer-md:focus-visible[\s\S]*?box-shadow: inset 0 0 0 2px var\(--focus-inset, var\(--color-brand\)\)/);
  });

  it("thang chữ mobile (< 768px) theo design-tokens §2.2, sàn 11px", () => {
    const mobile = /@media \(max-width: 767\.98px\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    for (const decl of [
      "--text-display: 44px",
      "--text-h1: 30px",
      "--text-h2: 24px",
      "--text-h3: 17px",
      "--enter-x: 24px",
      "--scale-from: 0.92",
    ]) {
      expect(mobile).toContain(decl);
    }
    expect(css).toContain("--text-hud: 11px");
    expect(css).toContain("--text-caption: 11px");
  });

  it("không có light mode", () => {
    expect(css).not.toContain("prefers-color-scheme");
    expect(css).not.toMatch(/\.dark\b/);
    expect(css).not.toContain("color-scheme: light");
  });
});

describe("trang hệ thống", () => {
  it("404: tiếng Việt + link về trang chủ", () => {
    render(<NotFound />);
    expect(screen.getByRole("heading", { name: "Không tìm thấy trang" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về trang chủ" })).toHaveAttribute("href", "/");
  });

  it("403: tiếng Việt + link về trang chủ", () => {
    render(<ForbiddenPage />);
    expect(
      screen.getByRole("heading", { name: "Bạn không có quyền truy cập trang này" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về trang chủ" })).toHaveAttribute("href", "/");
  });

  it("500: tiếng Việt, nút Thử lại gọi retry, có link về trang chủ", async () => {
    const retry = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<ErrorPage error={new Error("boom")} retry={retry} />);

    expect(screen.getByRole("heading", { name: "Đã có lỗi xảy ra" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Về trang chủ" })).toHaveAttribute("href", "/");
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});

describe("global-error (lỗi ở root layout)", () => {
  it("tự có <html lang=vi>, tiếng Việt, nút Thử lại và link về trang chủ", () => {
    const html = renderToStaticMarkup(<GlobalError error={new Error("boom")} retry={() => undefined} />);
    expect(html).toContain('<html lang="vi"');
    expect(html).toContain("Đã có lỗi xảy ra");
    expect(html).toContain("Thử lại");
    expect(html).toContain('href="/"');
  });
});

describe("cn", () => {
  it("giữ cả cỡ chữ token lẫn màu chữ token, vẫn gộp class cùng nhóm", () => {
    expect(cn("text-body text-fg-secondary")).toBe("text-body text-fg-secondary");
    expect(cn("text-body", "text-h3")).toBe("text-h3");
    expect(cn("rounded-md", "rounded-hero")).toBe("rounded-hero");
  });
});
