import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api/client", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

let routeId = "c1";
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: routeId }),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/components/admin/cinema-form", () => ({ CinemaForm: () => <div>cinema-form</div> }));
vi.mock("@/components/admin/cinema-status-dialog", () => ({
  CINEMA_STATUS_LABELS: { OPEN: "Mở", COMING_SOON: "Sắp mở", TEMP_CLOSED: "Tạm đóng", CLOSED: "Đóng" },
  CinemaStatusDialog: () => null,
}));

import AdminCinemaEditPage from "../[id]/page";
import AdminCinemasPage from "../page";

const cinema = {
  id: "c1",
  code: "HN01",
  name: "Cinemo Hà Nội",
  provinceCode: "HN",
  address: "1 Phố Huế",
  roomCount: 3,
  status: "OPEN",
};

function mockApi(me: unknown) {
  apiFetch.mockImplementation((path: string) => {
    if (path === "/me") return Promise.resolve(me);
    if (path === "/admin/cinemas") return Promise.resolve([cinema]);
    if (path === "/admin/cinemas/c1") return Promise.resolve(cinema);
    if (path === "/cinemas/c1/settings") return Promise.resolve({});
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

const adminMe = { isAdmin: true, cinemas: [] };
const managerMe = { isAdmin: false, cinemas: [{ cinemaId: "c1", role: "MANAGER" }] };

beforeEach(() => {
  apiFetch.mockReset();
  routeId = "c1";
});
afterEach(cleanup);

describe("link rạp → phòng & sơ đồ ghế", () => {
  it.each([
    ["ADMIN", adminMe],
    ["MANAGER", managerMe],
  ])("danh sách rạp (%s): mỗi dòng có link Phòng tới /admin/rap/<id>/phong", async (_role, me) => {
    mockApi(me);
    render(<AdminCinemasPage />);
    const link = await screen.findByRole("link", { name: /Phòng và sơ đồ ghế rạp Cinemo Hà Nội/ });
    expect(link).toHaveAttribute("href", "/admin/rap/c1/phong");
  });

  it("chi tiết rạp: có nút Phòng & sơ đồ ghế tới /admin/rap/<id>/phong", async () => {
    mockApi(adminMe);
    render(<AdminCinemaEditPage />);
    const link = await screen.findByRole("link", { name: "Phòng & sơ đồ ghế" });
    expect(link).toHaveAttribute("href", "/admin/rap/c1/phong");
  });

  it("tạo rạp mới (id=moi): không có nút phòng", async () => {
    routeId = "moi";
    mockApi(adminMe);
    render(<AdminCinemaEditPage />);
    await screen.findByText("cinema-form");
    expect(screen.queryByRole("link", { name: "Phòng & sơ đồ ghế" })).not.toBeInTheDocument();
  });
});
