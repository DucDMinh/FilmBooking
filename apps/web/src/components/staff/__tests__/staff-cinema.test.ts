import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api/client", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

import { loadStaffCinemas } from "../staff-cinema";

const cinemas = [
  { id: "a", code: "HN01", name: "A", address: "addr A" },
  { id: "b", code: "HN02", name: "B", address: "addr B" },
  { code: "NOID", name: "C", address: "x" },
];

function mockApi(me: unknown) {
  apiFetch.mockImplementation((path: string) => Promise.resolve(path === "/me" ? me : cinemas));
}

beforeEach(() => apiFetch.mockReset());

describe("loadStaffCinemas", () => {
  it("Admin thấy mọi rạp có id", async () => {
    mockApi({ isAdmin: true, cinemas: [] });
    expect((await loadStaffCinemas()).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("Staff/Manager chỉ thấy rạp được gán", async () => {
    mockApi({ isAdmin: false, cinemas: [{ cinemaId: "b", role: "STAFF" }] });
    expect(await loadStaffCinemas()).toEqual([{ id: "b", code: "HN02", name: "B", address: "addr B" }]);
  });

  it("không được gán rạp nào → rỗng", async () => {
    mockApi({ isAdmin: false, cinemas: [] });
    expect(await loadStaffCinemas()).toEqual([]);
  });
});
