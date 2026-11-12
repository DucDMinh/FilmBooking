import { describe, expect, it } from "vitest";

import { buildCinemaPopup } from "../cinema-map-popup";

const XSS_NAME = "<img src=x onerror=alert(1)>";
const XSS_ADDRESS = '"><script>alert(2)</script>';
const SAFE_URL = "https://www.openstreetmap.org/directions?to=10%2C106";

// Mô phỏng cách Leaflet gắn nội dung: string -> innerHTML, HTMLElement -> appendChild.
function mount(content: string | HTMLElement): HTMLElement {
  const host = document.createElement("div");
  if (typeof content === "string") host.innerHTML = content;
  else host.appendChild(content);
  return host;
}

describe("buildCinemaPopup (K6 XSS)", () => {
  it("không tạo img/script từ tên rạp và địa chỉ độc hại, hiển thị nguyên văn", () => {
    const host = mount(buildCinemaPopup(XSS_NAME, XSS_ADDRESS, SAFE_URL));
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector("script")).toBeNull();
    expect(host.textContent).toContain(XSS_NAME);
    expect(host.textContent).toContain(XSS_ADDRESS);
  });

  it("không có attribute on* nào trên bất kỳ phần tử", () => {
    const host = mount(buildCinemaPopup(XSS_NAME, XSS_ADDRESS, SAFE_URL));
    const hasHandler = [...host.querySelectorAll("*")].some((el) =>
      el.getAttributeNames().some((n) => n.startsWith("on")),
    );
    expect(hasHandler).toBe(false);
  });

  it("link chỉ đường giữ https và rel an toàn", () => {
    const link = mount(buildCinemaPopup("Rạp A", "1 Lê Lợi", SAFE_URL)).querySelector("a");
    expect(link?.getAttribute("href")).toBe(SAFE_URL);
    expect(link?.getAttribute("rel")).toContain("noopener");
  });

  it("chặn scheme javascript: ở href", () => {
    const link = mount(buildCinemaPopup("Rạp A", "x", "javascript:alert(1)")).querySelector("a");
    expect(link?.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
  });
});
