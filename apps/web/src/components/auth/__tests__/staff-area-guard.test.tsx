import "@testing-library/jest-dom/vitest";

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ replace }),
}));

import { StaffAreaGuard } from "../staff-area-guard";

beforeEach(() => {
  replace.mockClear();
});
afterEach(cleanup);

describe("StaffAreaGuard", () => {
  it("nhân sự điều hướng mềm từ /tai-khoan sang trang khách → đưa về trang chủ vai trò", () => {
    pathname = "/phim";
    render(<StaffAreaGuard home="/admin" />);
    expect(replace).toHaveBeenCalledWith("/admin");
  });

  it("ở lại /tai-khoan/* thì không điều hướng", () => {
    pathname = "/tai-khoan/bao-mat";
    render(<StaffAreaGuard home="/admin" />);
    expect(replace).not.toHaveBeenCalled();
  });

  it("render không tạo DOM", () => {
    pathname = "/tai-khoan";
    const { container } = render(<StaffAreaGuard home="/staff/chon-rap" />);
    expect(container).toBeEmptyDOMElement();
  });
});
