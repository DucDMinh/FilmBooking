import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { Scrub, ScrubGroup } from "../scrub";

afterEach(cleanup);

describe("Scrub", () => {
  it("gắn data-scrub và --i/--n, không thêm class nào ngoài className truyền vào", () => {
    render(
      <Scrub kind="ltr" i={3} n={14} className="date" data-testid="s">
        Hôm nay
      </Scrub>,
    );
    const el = screen.getByTestId("s");
    expect(el.tagName).toBe("DIV");
    expect(el).toHaveAttribute("data-scrub", "ltr");
    expect(el.style.getPropertyValue("--i")).toBe("3");
    expect(el.style.getPropertyValue("--n")).toBe("14");
    expect(el).toHaveClass("date");
    expect(el).toHaveTextContent("Hôm nay");
  });

  it("không ghi --i/--n inline khi không truyền (để CSS :nth-child hoặc ScrubGroup quyết định)", () => {
    render(<Scrub kind="beam" data-testid="s" />);
    const el = screen.getByTestId("s");
    expect(el.style.getPropertyValue("--i")).toBe("");
    expect(el.style.getPropertyValue("--n")).toBe("");
    expect(el).toHaveAttribute("data-scrub", "beam");
  });

  it("đổi thẻ bằng `as` và giữ style gốc của người dùng", () => {
    render(
      <Scrub as="li" kind="right" i={1} style={{ color: "red" }} data-testid="s">
        Rạp
      </Scrub>,
    );
    const el = screen.getByTestId("s");
    expect(el.tagName).toBe("LI");
    expect(el).toHaveAttribute("data-scrub", "right");
    expect(el.style.color).toBe("red");
    expect(el.style.getPropertyValue("--i")).toBe("1");
  });
});

describe("Scrub first (ngoại lệ hàng đầu, NFR-19 / AC-35)", () => {
  it("ghi data-scrub-first khi first, và không ghi khi bỏ trống hoặc false", () => {
    render(
      <>
        <Scrub kind="down" first data-testid="a" />
        <Scrub kind="down" first={false} data-testid="b" />
        <Scrub kind="down" data-testid="c" />
      </>,
    );
    expect(screen.getByTestId("a")).toHaveAttribute("data-scrub-first", "");
    expect(screen.getByTestId("b")).not.toHaveAttribute("data-scrub-first");
    expect(screen.getByTestId("c")).not.toHaveAttribute("data-scrub-first");
  });

  it("first vẫn giữ data-scrub và --i/--n để hàng sau tính lại độc lập", () => {
    render(<Scrub kind="ltr" first i={2} n={5} data-testid="s" />);
    const el = screen.getByTestId("s");
    expect(el).toHaveAttribute("data-scrub", "ltr");
    expect(el.style.getPropertyValue("--i")).toBe("2");
    expect(el.style.getPropertyValue("--n")).toBe("5");
  });
});

describe("globals.css: quy tắc hàng đầu không scrub", () => {
  const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const gated = css.slice(css.indexOf("@media (prefers-reduced-motion: no-preference)"), css.indexOf("@media print"));
  const FIRST_ROW = "animation: none; opacity: 1; translate: 0 0; scale: 1;";

  it("phần tử đánh dấu tay data-scrub-first tắt animation và hiện đủ, kể cả wipe/rule/media/beam lồng bên trong", () => {
    expect(gated).toContain(`[data-scrub][data-scrub-first] { ${FIRST_ROW} }`);
    expect(gated).toMatch(
      /\[data-scrub\]\[data-scrub-first\] :is\(\[data-scrub-wipe\], \[data-scrub-rule\], \[data-scrub-media\], \[data-scrub-beam\]\) \{\s*animation: none;/,
    );
  });

  it("quy tắc hàng đầu nằm SAU mọi animation-name để thắng khi cùng độ ưu tiên", () => {
    const firstRule = gated.indexOf("[data-scrub][data-scrub-first] {");
    for (const name of ['[data-scrub="beam"] [data-scrub-beam] { animation-name: beamLine; }', "[data-scrub-rule] { animation-name: drawX;"]) {
      expect(gated.indexOf(name)).toBeGreaterThan(-1);
      expect(gated.indexOf(name)).toBeLessThan(firstRule);
    }
  });

  it("lưới phim: 2 thẻ đầu (< 560px), 3 thẻ (>= 560px), 4 thẻ (>= 1024px) khớp 2/3/4 cột của movie-card.module.css", () => {
    expect(gated).toContain('[data-scrub-grid="movie"] > [data-scrub]:nth-child(-n + 2)');
    expect(gated).toMatch(/@media \(min-width: 560px\) \{\s*\[data-scrub-grid="movie"\] > \[data-scrub\]:nth-child\(-n \+ 3\) \{ animation: none/);
    expect(gated).toMatch(/@media \(min-width: 1024px\) \{\s*\[data-scrub-grid="movie"\] > \[data-scrub\]:nth-child\(-n \+ 4\) \{ animation: none/);
    const moduleCss = readFileSync(resolve(process.cwd(), "src/components/catalog/movie-card.module.css"), "utf8");
    expect(moduleCss).toMatch(/\.grid \{[^}]*repeat\(4,/);
    expect(moduleCss).toMatch(/max-width: 1023px\) \{\s*\.grid \{ grid-template-columns: repeat\(3,/);
    expect(moduleCss).toMatch(/max-width: 559px\) \{\s*\.grid \{ grid-template-columns: repeat\(2,/);
  });

  it("lưới rạp: 1 thẻ đầu (< 768px), 2 thẻ (>= 768px), 3 thẻ (>= 1024px) khớp grid-cols-1 md:2 lg:3", () => {
    expect(gated).toContain('[data-scrub-grid="cinema"] > [data-scrub]:nth-child(-n + 1)');
    expect(gated).toMatch(/@media \(min-width: 768px\) \{\s*\[data-scrub-grid="cinema"\] > \[data-scrub\]:nth-child\(-n \+ 2\) \{ animation: none/);
    expect(gated).toMatch(/@media \(min-width: 1024px\) \{[\s\S]*\[data-scrub-grid="cinema"\] > \[data-scrub\]:nth-child\(-n \+ 3\) \{ animation: none/);
  });

  it("vẫn bọc trong reduced-motion + @supports (không scrub khi ngoài điều kiện)", () => {
    expect(css.slice(0, css.indexOf("@media (prefers-reduced-motion: no-preference)"))).not.toContain("data-scrub-first");
    expect(gated.indexOf("@supports (animation-timeline: view())")).toBeLessThan(gated.indexOf("[data-scrub-first]"));
  });
});

describe("ScrubGroup", () => {
  it("gắn data-scrub-group và --n cho cả nhóm", () => {
    render(
      <ScrubGroup n={4} as="section" className="grid" data-testid="g">
        <Scrub kind="down" i={0} data-testid="c" />
      </ScrubGroup>,
    );
    const group = screen.getByTestId("g");
    expect(group.tagName).toBe("SECTION");
    expect(group).toHaveAttribute("data-scrub-group");
    expect(group.style.getPropertyValue("--n")).toBe("4");
    expect(group).toHaveClass("grid");
    expect(screen.getByTestId("c")).toHaveAttribute("data-scrub", "down");
  });
});
