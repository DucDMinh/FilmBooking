import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

import { Badge, badgeVariants } from "../badge";
import { buttonVariants } from "../button";

afterEach(cleanup);

describe("cn với token CYBERPLEX", () => {
  it("text-hud là cỡ chữ, không bị coi là màu và không bị màu chữ xoá", () => {
    expect(cn("text-hud", "text-danger-text")).toBe("text-hud text-danger-text");
    expect(cn("text-body", "text-hud")).toBe("text-hud");
  });
});

describe("Badge", () => {
  it.each([
    ["danger", "text-danger-text"],
    ["brand", "text-brand"],
    ["success", "text-success"],
  ] as const)("tone %s giữ cả cỡ chữ 11px (text-hud) lẫn màu chữ", (tone, color) => {
    render(<Badge tone={tone}>Nhãn</Badge>);
    const el = screen.getByText("Nhãn");
    expect(el).toHaveClass("text-hud", color, "chamfer-sm");
  });

  it("badgeVariants dùng trực tiếp cũng có đủ class", () => {
    expect(cn(badgeVariants({ tone: "danger" }))).toContain("text-hud");
  });
});

describe("Button", () => {
  it("variant link không dịch 1px khi hover/active; các variant khác có", () => {
    const link = buttonVariants({ variant: "link" });
    expect(link).not.toContain("translateY");
    expect(buttonVariants({ variant: "default" })).toContain("hover:[transform:translateY(-1px)]");
    expect(buttonVariants({ variant: "ghost" })).toContain("hover:[transform:translateY(-1px)]");
  });
});
