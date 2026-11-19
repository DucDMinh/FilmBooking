import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
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
