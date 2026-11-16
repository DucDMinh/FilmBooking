import { describe, expect, it } from "vitest";

import { isStaffAllowedPath, resolvePostLoginTarget, roleHome } from "../role-home";

const customer = { isAdmin: false, cinemas: [] };
const staff = { isAdmin: false, cinemas: [{ cinemaId: "c1", role: "STAFF" as const }] };
const manager = { isAdmin: false, cinemas: [{ cinemaId: "c1", role: "MANAGER" as const }] };
const admin = { isAdmin: true, cinemas: [] };

describe("roleHome", () => {
  it("ADMIN và MANAGER về /admin, STAFF về trang chọn rạp soát vé, CUSTOMER không có trang chủ riêng", () => {
    expect(roleHome(admin)).toBe("/admin");
    expect(roleHome(manager)).toBe("/admin");
    expect(roleHome(staff)).toBe("/staff/chon-rap");
    expect(roleHome(customer)).toBeNull();
    expect(roleHome(null)).toBeNull();
    expect(roleHome(undefined)).toBeNull();
  });

  it("nhiều vai trò: ADMIN > MANAGER > STAFF", () => {
    const adminAndStaff = { isAdmin: true, cinemas: staff.cinemas };
    const managerAndStaff = {
      isAdmin: false,
      cinemas: [
        { cinemaId: "c1", role: "STAFF" as const },
        { cinemaId: "c2", role: "MANAGER" as const },
      ],
    };
    expect(roleHome(adminAndStaff)).toBe("/admin");
    expect(roleHome(managerAndStaff)).toBe("/admin");
  });
});

describe("isStaffAllowedPath", () => {
  it("cho phép /admin*, /staff* và /tai-khoan*", () => {
    for (const p of ["/admin", "/admin/don-hang", "/admin?x=1", "/staff/soat-ve", "/tai-khoan", "/tai-khoan/bao-mat?error=oauth"]) {
      expect(isStaffAllowedPath(p)).toBe(true);
    }
  });

  it("chặn trang khách và tiền tố trùng một phần", () => {
    for (const p of ["/", "/phim", "/dat-ve/abc", "/ve", "/administrator", "/tai-khoanx", "/rap"]) {
      expect(isStaffAllowedPath(p)).toBe(false);
    }
  });

  it("không bị lách bằng dot-segment (/admin/../phim)", () => {
    expect(isStaffAllowedPath("/admin/../phim")).toBe(false);
    expect(isStaffAllowedPath("/admin/%2e%2e/phim")).toBe(false);
  });
});

describe("resolvePostLoginTarget", () => {
  it("CUSTOMER giữ nguyên: next hợp lệ hoặc trang chủ", () => {
    expect(resolvePostLoginTarget({ next: "/dat-ve/abc", me: customer })).toBe("/dat-ve/abc");
    expect(resolvePostLoginTarget({ next: undefined, me: customer })).toBe("/");
    expect(resolvePostLoginTarget({ next: null, me: customer })).toBe("/");
  });

  it("CUSTOMER vào /admin qua next vẫn giữ next (trang admin tự trả /khong-co-quyen)", () => {
    expect(resolvePostLoginTarget({ next: "/admin", me: customer })).toBe("/admin");
  });

  it("không lấy được /me (null) → như khách: next hoặc /", () => {
    expect(resolvePostLoginTarget({ next: "/ve", me: null })).toBe("/ve");
    expect(resolvePostLoginTarget({ next: undefined, me: null })).toBe("/");
  });

  it("ADMIN/MANAGER → /admin, STAFF → /staff/chon-rap khi không có next", () => {
    expect(resolvePostLoginTarget({ next: undefined, me: admin })).toBe("/admin");
    expect(resolvePostLoginTarget({ next: undefined, me: manager })).toBe("/admin");
    expect(resolvePostLoginTarget({ next: undefined, me: staff })).toBe("/staff/chon-rap");
  });

  it("nhân sự: next trỏ trang khách bị bỏ qua", () => {
    expect(resolvePostLoginTarget({ next: "/", me: admin })).toBe("/admin");
    expect(resolvePostLoginTarget({ next: "/dat-ve/abc", me: manager })).toBe("/admin");
    expect(resolvePostLoginTarget({ next: "/phim", me: staff })).toBe("/staff/chon-rap");
  });

  it("nhân sự: next hợp lệ vào /admin*, /staff*, /tai-khoan* được tôn trọng", () => {
    expect(resolvePostLoginTarget({ next: "/admin/rap/moi", me: admin })).toBe("/admin/rap/moi");
    expect(resolvePostLoginTarget({ next: "/staff/soat-ve", me: staff })).toBe("/staff/soat-ve");
    expect(resolvePostLoginTarget({ next: "/tai-khoan/bao-mat", me: staff })).toBe("/tai-khoan/bao-mat");
  });

  it("chống open-redirect: next độc hại bị loại, nhân sự về trang chủ vai trò, khách về /", () => {
    for (const evil of ["//evil.com", "https://evil.com", "/\\evil.com", "javascript:alert(1)"]) {
      expect(resolvePostLoginTarget({ next: evil, me: admin })).toBe("/admin");
      expect(resolvePostLoginTarget({ next: evil, me: customer })).toBe("/");
    }
  });
});
