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
  Inter: () => ({ variable: "inter-var", className: "inter-class" }),
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

  it("đặt lang=vi, nạp biến font Inter và render children", () => {
    expect(html).toContain('<html lang="vi"');
    expect(html).toContain("inter-var");
    expect(html).toContain("nội dung trang");
  });

  it("chỉ dark (D1): không class .dark, không nút đổi theme", () => {
    expect(html).not.toMatch(/class="[^"]*\bdark\b/);
    expect(html.toLowerCase()).not.toContain("theme-toggle");
  });
});

describe("globals.css", () => {
  const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

  it("khai báo token CINEMO chính và color-scheme dark", () => {
    expect(css).toContain("color-scheme: dark");
    expect(css).toContain("--color-bg: #0B0D12");
    expect(css).toContain("--color-brand: #F06D5B");
    expect(css).toContain("--color-fg-on-brand: #0B0D12");
    expect(css).toContain("--color-border-input: #66768C");
    expect(css).toContain("--radius-lg: 16px");
    expect(css).toContain("--shadow-overlay: 0 8px 28px rgb(0 0 0 / 0.26)");
  });

  it("thang chữ mobile (< 768px) theo design-tokens §2.2, sàn 11px", () => {
    const mobile = /@media \(max-width: 767\.98px\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    for (const decl of [
      "--text-display: 32px",
      "--text-h1: 26px",
      "--text-h2: 20px",
      "--text-h3: 17px",
      "--text-caption: 11px",
    ]) {
      expect(mobile).toContain(decl);
    }
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
