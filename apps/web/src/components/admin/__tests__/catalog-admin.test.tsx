import "@testing-library/jest-dom/vitest";

import type { CinemaDto } from "@filmbooking/shared/schemas/catalog";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
let routeId = "moi";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ id: routeId }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const apiFetch = vi.fn();
vi.mock("@/lib/api/client", async () => {
  const actual: Record<string, unknown> = await vi.importActual("@/lib/api/client");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetch(...args) };
});

import AdminCinemaEditPage from "@/app/admin/rap/[id]/page";
import AdminCinemasPage from "@/app/admin/rap/page";
import { ApiError } from "@/lib/api/client";
import { CinemaForm } from "../cinema-form";
import { CinemaStatusDialog } from "../cinema-status-dialog";
import { uploadImage, validateImageFile } from "../image-upload-field";
import { MovieForm, slugify, type AdminMovie } from "../movie-form";

const movie: AdminMovie = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "dune",
  titleVi: "Dune",
  titleOriginal: null,
  posterUrl: null,
  bannerUrl: null,
  trailerUrl: null,
  description: null,
  genres: ["Khoa học viễn tưởng"],
  durationMinutes: 150,
  director: null,
  cast: [],
  country: null,
  originalLanguage: null,
  subtitleLanguages: [],
  dubbedLanguages: [],
  releaseDate: "2026-03-01",
  ageRating: "T13",
  availability: "now_showing",
  status: "PUBLISHED",
};

const cinema: CinemaDto = {
  id: "22222222-2222-4222-8222-222222222222",
  code: "HN01",
  name: "CINEMO Long Biên",
  provinceCode: "HN",
  district: null,
  address: "1 Long Biên",
  latitude: null,
  longitude: null,
  hotline: null,
  email: null,
  openingHours: null,
  imageUrl: null,
  amenities: [],
  status: "OPEN",
};

beforeEach(() => {
  apiFetch.mockReset();
  push.mockReset();
  routeId = "moi";
  // Radix Select cần các API này trong jsdom.
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;
});
afterEach(cleanup);

describe("MovieForm", () => {
  it("slugify bỏ dấu tiếng Việt", () => {
    expect(slugify("Đại chiến Người Nhện!")).toBe("dai-chien-nguoi-nhen");
  });

  it("form trống: báo lỗi theo field bằng zod schema shared, không gọi API", async () => {
    render(<MovieForm />);
    await userEvent.click(screen.getByRole("button", { name: "Tạo phim" }));
    expect(await screen.findAllByRole("alert")).not.toHaveLength(0);
    expect(screen.getByLabelText(/Tên phim/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/Thời lượng/)).toHaveAttribute("aria-invalid", "true");
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("sửa phim: PATCH payload đã chuẩn hoá rồi quay về danh sách", async () => {
    apiFetch.mockResolvedValue(undefined);
    render(<MovieForm movie={movie} />);
    const genres = screen.getByLabelText("Thể loại");
    await userEvent.clear(genres);
    await userEvent.type(genres, "Hành động, Phiêu lưu");
    await userEvent.click(screen.getByRole("button", { name: "Lưu phim" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    const [path, init] = apiFetch.mock.calls[0] as [string, { method: string; json: Record<string, unknown> }];
    expect(path).toBe(`/admin/movies/${movie.id}`);
    expect(init.method).toBe("PATCH");
    expect(init.json).toMatchObject({ genres: ["Hành động", "Phiêu lưu"], durationMinutes: 150, ageRating: "T13" });
    expect(push).toHaveBeenCalledWith("/admin/phim");
  });

  it("slug trùng: API thật trả 409 CONFLICT không details -> lỗi gắn vào ô slug", async () => {
    apiFetch.mockRejectedValue(new ApiError("CONFLICT", "Dữ liệu đã tồn tại.", 409));
    render(<MovieForm movie={movie} />);
    await userEvent.click(screen.getByRole("button", { name: "Lưu phim" }));
    const slug = await screen.findByLabelText(/Mã phim/);
    await waitFor(() => expect(slug).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByText("Mã phim (slug) đã tồn tại")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("400 VALIDATION_ERROR có issues[path] vẫn gắn đúng field", async () => {
    apiFetch.mockRejectedValue(
      new ApiError("VALIDATION_ERROR", "x", 400, { issues: [{ path: "durationMinutes", message: "Invalid" }] }),
    );
    render(<MovieForm movie={movie} />);
    await userEvent.click(screen.getByRole("button", { name: "Lưu phim" }));
    await waitFor(() => expect(screen.getByLabelText(/Thời lượng/)).toHaveAttribute("aria-invalid", "true"));
  });
});

describe("CinemaForm", () => {
  it("Manager: mã rạp bị khoá, PATCH thông tin không kèm code/tỉnh rồi PATCH cấu hình", async () => {
    apiFetch.mockResolvedValue(undefined);
    render(
      <CinemaForm
        role="MANAGER"
        cinema={cinema}
        settings={{ cleaningMinutes: null, onlineCutoffMinutes: null, effectiveCleaningMinutes: 15 }}
      />,
    );
    expect(screen.getByLabelText(/Mã rạp/)).toBeDisabled();
    expect(screen.getByText("Để trống = mặc định chuỗi (15 phút)")).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalledWith("/provinces");

    await userEvent.type(screen.getByLabelText(/Thời gian dọn phòng/), "20");
    await userEvent.click(screen.getByRole("button", { name: "Lưu rạp" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    const info = apiFetch.mock.calls[0] as [string, { method: string; json: Record<string, unknown> }];
    expect(info[0]).toBe(`/admin/cinemas/${cinema.id}`);
    expect(info[1].json).not.toHaveProperty("code");
    expect(info[1].json).not.toHaveProperty("provinceCode");
    const settings = apiFetch.mock.calls[1] as [string, { json: unknown }];
    expect(settings[0]).toBe(`/cinemas/${cinema.id}/settings`);
    expect(settings[1].json).toEqual({ cleaningMinutes: 20, onlineCutoffMinutes: null });
  });

  it("mã rạp trùng: 409 CONFLICT -> lỗi gắn vào ô Mã rạp", async () => {
    apiFetch.mockImplementation((path: string) =>
      path === "/provinces"
        ? Promise.resolve([{ code: "HN", name: "Hà Nội" }])
        : Promise.reject(new ApiError("CONFLICT", "Dữ liệu đã tồn tại.", 409)),
    );
    render(<CinemaForm role="ADMIN" cinema={cinema} settings={{ cleaningMinutes: null, onlineCutoffMinutes: null }} />);
    await userEvent.click(screen.getByRole("button", { name: "Lưu rạp" }));
    await waitFor(() => expect(screen.getByLabelText(/Mã rạp/)).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByText("Mã rạp đã tồn tại")).toBeInTheDocument();
  });

  it("tỉnh/thành không tồn tại (400 details.provinceCode) -> lỗi gắn vào ô tỉnh/thành", async () => {
    apiFetch.mockImplementation((path: string) =>
      path === "/provinces"
        ? Promise.resolve([])
        : Promise.reject(new ApiError("VALIDATION_ERROR", "x", 400, { provinceCode: "ZZ" })),
    );
    render(<CinemaForm role="ADMIN" cinema={cinema} settings={{ cleaningMinutes: null, onlineCutoffMinutes: null }} />);
    await userEvent.click(screen.getByRole("button", { name: "Lưu rạp" }));
    expect(await screen.findByText("Tỉnh/thành không tồn tại")).toBeInTheDocument();
  });

  it("không đổi cấu hình thì KHÔNG gửi PATCH settings (không reset giá trị riêng của rạp)", async () => {
    apiFetch.mockResolvedValue(undefined);
    render(<CinemaForm role="MANAGER" cinema={cinema} settings={{ cleaningMinutes: 25, onlineCutoffMinutes: 10 }} />);
    await userEvent.click(screen.getByRole("button", { name: "Lưu rạp" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/rap"));
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch.mock.calls[0]?.[0]).toBe(`/admin/cinemas/${cinema.id}`);
  });

  it("tạo rạp thiếu trường bắt buộc: lỗi theo field, không gọi API tạo", async () => {
    apiFetch.mockResolvedValue([]);
    render(<CinemaForm role="ADMIN" />);
    await userEvent.click(screen.getByRole("button", { name: "Tạo rạp" }));
    await waitFor(() => expect(screen.getByLabelText(/Tên rạp/)).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByLabelText(/Địa chỉ/)).toHaveAttribute("aria-invalid", "true");
    expect(apiFetch).not.toHaveBeenCalledWith("/admin/cinemas", expect.anything());
  });
});

describe("CinemaStatusDialog (AC-26)", () => {
  it("còn suất đã bán -> hiện cảnh báo + danh sách + link huỷ hàng loạt, không báo đã đổi", async () => {
    const showtimeId = "33333333-3333-4333-8333-333333333333";
    const onChanged = vi.fn();
    apiFetch.mockImplementation((path: string) => {
      if (path.endsWith("/status")) {
        return Promise.reject(new ApiError("CONFLICT", "x", 409, { showtimeIds: [showtimeId] }));
      }
      return Promise.resolve([
        { id: showtimeId, roomId: "r", startsAt: "2026-12-01T12:00:00.000Z", endsAt: "", format: "2D", languageMode: "SUB", status: "SCHEDULED" },
      ]);
    });
    render(<CinemaStatusDialog cinema={cinema} open onOpenChange={vi.fn()} onChanged={onChanged} />);

    await userEvent.click(screen.getByRole("combobox", { name: "Trạng thái mới" }));
    await userEvent.click(await screen.findByRole("option", { name: "Tạm đóng" }));
    await userEvent.click(screen.getByRole("button", { name: "Đổi trạng thái" }));

    expect(await screen.findByText(/còn 1 suất tương lai đã bán vé/)).toBeInTheDocument();
    expect(await screen.findByText(/2D/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Huỷ hàng loạt các suất" })).toHaveAttribute(
      "href",
      `/admin/lich-chieu?cinema=${cinema.id}&cancelAll=1`,
    );
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe("AdminCinemasPage", () => {
  const closedCinema = { ...cinema, status: "TEMP_CLOSED" as const, roomCount: 3 };
  function mockMe(
    me: unknown,
    list: unknown[] = [closedCinema, { ...cinema, id: "other", code: "HN02", name: "Rạp khác", roomCount: 0 }],
  ) {
    apiFetch.mockImplementation((path: string) => {
      if (path === "/me") return Promise.resolve(me);
      if (path === "/admin/cinemas") return Promise.resolve(list);
      return Promise.reject(new Error(`unexpected ${path}`));
    });
  }

  it("Manager: hiện rạp đang đóng từ /admin/cinemas, không có nút Thêm rạp / Đổi trạng thái", async () => {
    mockMe(
      { id: "u", email: null, emailConfirmed: true, isAdmin: false, cinemas: [{ cinemaId: cinema.id, role: "MANAGER" }] },
      [closedCinema],
    );
    render(<AdminCinemasPage />);
    expect(await screen.findByText("CINEMO Long Biên")).toBeInTheDocument();
    expect(screen.getByText("Tạm đóng")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Thêm rạp" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Đổi trạng thái/ })).not.toBeInTheDocument();
  });

  it("Admin: thấy tất cả rạp, có Thêm rạp và Đổi trạng thái", async () => {
    mockMe({ id: "u", email: null, emailConfirmed: true, isAdmin: true, cinemas: [] });
    render(<AdminCinemasPage />);
    expect(await screen.findByText("Rạp khác")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Thêm rạp" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Đổi trạng thái/ })).toHaveLength(2);
  });
});

describe("AdminCinemaEditPage", () => {
  const me = { id: "u", email: null, emailConfirmed: true, isAdmin: true, cinemas: [] };

  function mockApi(settings: () => Promise<unknown>) {
    apiFetch.mockImplementation((path: string) => {
      if (path === "/me") return Promise.resolve(me);
      if (path === `/admin/cinemas/${cinema.id}`) return Promise.resolve({ ...cinema, status: "CLOSED", roomCount: 0 });
      if (path === `/cinemas/${cinema.id}/settings`) return settings();
      if (path === "/provinces") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected ${path}`));
    });
  }

  it("mở lại được rạp đã đóng và hiện cấu hình đã lưu", async () => {
    routeId = cinema.id as string;
    mockApi(() => Promise.resolve({ cleaningMinutes: 25, onlineCutoffMinutes: null }));
    render(<AdminCinemaEditPage />);
    expect(await screen.findByLabelText(/Thời gian dọn phòng/)).toHaveValue(25);
  });

  it("GET settings lỗi -> ErrorState, KHÔNG hiện form (không thể PATCH null reset cấu hình)", async () => {
    routeId = cinema.id as string;
    mockApi(() => Promise.reject(new ApiError("UNKNOWN", "x", 500)));
    render(<AdminCinemaEditPage />);
    expect(await screen.findByText("Không tải được dữ liệu")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lưu rạp" })).not.toBeInTheDocument();
    expect(apiFetch.mock.calls.some(([, init]) => (init as { method?: string } | undefined)?.method === "PATCH")).toBe(false);
  });
});

describe("upload ảnh", () => {
  it("validateImageFile chặn định dạng và dung lượng", () => {
    expect(validateImageFile({ type: "image/png", size: 1000 })).toBeNull();
    expect(validateImageFile({ type: "application/pdf", size: 1000 })).toMatch(/JPG, PNG/);
    expect(validateImageFile({ type: "image/png", size: 5 * 1024 * 1024 + 1 })).toMatch(/5 MB/);
  });

  it("xin signed URL từ API rồi PUT file, trả về URL công khai", async () => {
    apiFetch.mockResolvedValue({ path: "p.png", token: "t", signedUrl: "https://s.test/upload", publicUrl: "https://s.test/public/p.png" });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["x"], "a.png", { type: "image/png" });
    await expect(uploadImage(file, "posters")).resolves.toBe("https://s.test/public/p.png");
    expect(apiFetch).toHaveBeenCalledWith("/admin/uploads", {
      method: "POST",
      json: { bucket: "posters", cinemaId: undefined, contentType: "image/png", sizeBytes: 1 },
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://s.test/upload");
    expect((fetchMock.mock.calls[0]?.[1] as { method: string }).method).toBe("PUT");
    vi.unstubAllGlobals();
  });

  it("Storage từ chối -> ném lỗi để form hiện thông báo", async () => {
    apiFetch.mockResolvedValue({ path: "p.png", token: "t", signedUrl: "https://s.test/upload", publicUrl: "u" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(uploadImage(new File(["x"], "a.png", { type: "image/png" }), "banners")).rejects.toThrow();
    vi.unstubAllGlobals();
  });
});
