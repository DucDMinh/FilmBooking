import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { SELECT_FIELD_CLASS } from "../filter-field";

const css = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

describe("theme cho <select> gốc (CR-012)", () => {
  const globals = css("../../../app/globals.css");
  const supportsBlock = globals.slice(globals.indexOf("@supports (appearance: base-select)"));

  it("globals.css bật base-select và vẽ popup/mũi tên/option theo token trong @supports", () => {
    expect(globals).toContain("@supports (appearance: base-select)");
    for (const needle of [
      "select, select::picker(select) { appearance: base-select; }",
      "select::picker(select)",
      "select::picker-icon",
      "select:open::picker-icon",
      "select option::checkmark",
      "select option:checked",
    ]) {
      expect(supportsBlock).toContain(needle);
    }
  });

  it("popup vuông, dùng token nền/viền/bóng của design system", () => {
    expect(supportsBlock).toMatch(/border-radius:\s*0;/);
    expect(supportsBlock).toContain("var(--color-surface-elevated)");
    expect(supportsBlock).toContain("var(--color-border-input)");
    expect(supportsBlock).toContain("var(--shadow-overlay)");
  });

  it("popup mặc định hiện (opacity 1); không dùng ::picker(select):popover-open vì lightningcss xoá selector đó", () => {
    const rule = supportsBlock.slice(supportsBlock.search(/select::picker\(select\) \{\s*box-sizing/));
    expect(rule.slice(0, rule.indexOf("}"))).toContain("opacity: 1;");
    expect(supportsBlock.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/::picker\(select\):[a-z-]/);
    expect(supportsBlock).toContain("@starting-style");
  });

  it("option hover/focus có vạch trái vàng (nền gần trùng popup nên cần nhấn brand), khác với :checked", () => {
    expect(supportsBlock).toMatch(/select option:hover,\s*select option:focus\s*\{[^}]*inset 3px 0 0 var\(--color-brand\)/);
    expect(supportsBlock).toMatch(/select option:checked\s*\{[^}]*var\(--color-brand-soft\)/);
  });

  it("trình duyệt chưa hỗ trợ vẫn có option tối (fallback ngoài @supports)", () => {
    const beforeSupports = globals.slice(0, globals.indexOf("@supports (appearance: base-select)"));
    expect(beforeSupports).toMatch(/option\s*\{\s*background-color:\s*var\(--color-surface-elevated\)/);
  });

  it("QuickBookBar cũng mở popup base-select và ẩn mũi tên thứ hai", () => {
    const hero = css("../../home/home-hero.css");
    expect(hero).toContain("appearance: base-select");
    expect(hero).toMatch(/\.qfield select::picker-icon\s*\{\s*display:\s*none;/);
  });

  it("SELECT_FIELD_CLASS: ô đóng cùng kiểu ô nhập, không còn nền trong suốt hay px-2 lệch", () => {
    expect(SELECT_FIELD_CLASS).not.toContain("bg-transparent");
    expect(SELECT_FIELD_CLASS).not.toMatch(/\bpx-2\b/);
    for (const token of [
      "rounded-none",
      "border-border-input",
      "bg-surface-input",
      "px-3",
      "h-11",
      "md:h-10",
      "text-base",
      "md:text-body",
      "focus-visible:border-brand",
      "disabled:opacity-45",
      "aria-invalid:border-danger",
    ]) {
      expect(SELECT_FIELD_CLASS.split(" ")).toContain(token);
    }
  });
});
