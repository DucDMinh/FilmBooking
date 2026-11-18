import "@testing-library/jest-dom/vitest";

import type { CinemaDto } from "@filmbooking/shared/schemas/catalog";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  scheduledStatus: null,
  scheduledEffectiveAt: null,
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

describe("CinemaStatusDialog (R-136, AC-30)", () => {
  const NOW = new Date("2026-11-18T03:00:00.000Z"); // 10:00 VN 18/11 -> hiệu lực 25/11/2026

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  const result = (over: Record<string, unknown> = {}) => ({
    success: true,
    cinemaId: cinema.id,
    status: "OPEN",
    scheduledStatus: "CLOSED",
    scheduledEffectiveAt: "2026-11-25T03:00:00.000Z",
    scheduleCancelled: false,
    emailsEnqueuedCount: 42,
    ...over,
  });

  async function pick(label: string) {
    await userEvent.click(screen.getByRole("combobox", { name: "Trạng thái mới" }));
    await userEvent.click(await screen.findByRole("option", { name: label }));
  }

  it("chọn Đóng cửa: giải thích ngày hiệu lực +7 ngày + email + hoàn tiền; xác nhận gọi PATCH /status, báo số email", async () => {
    const onChanged = vi.fn();
    apiFetch.mockResolvedValue(result());
    const { toast } = await import("sonner");
    render(<CinemaStatusDialog cinema={cinema} open onOpenChange={vi.fn()} onChanged={onChanged} />);

    // Trạng thái hiện tại + chưa có lịch: chưa có gì để xác nhận.
    expect(screen.getByRole("button", { name: "Hẹn đổi trạng thái & gửi email" })).toBeDisabled();

    await pick("Ngừng hoạt động");
    expect(screen.getByText(/có hiệu lực vào 25\/11\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/gửi email tới toàn bộ khách hàng/)).toBeInTheDocument();
    expect(screen.getByText(/đến quầy hoàn tiền trước ngày 25\/11\/2026/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Hẹn đổi trạng thái & gửi email" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(apiFetch).toHaveBeenCalledWith(`/admin/cinemas/${cinema.id}/status`, {
      method: "PATCH",
      json: { status: "CLOSED" },
    });
    expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ scheduledStatus: "CLOSED", status: "OPEN" }));
    expect(vi.mocked(toast.success).mock.calls.at(-1)?.[0]).toMatch(/42 khách hàng/);
  });

  it("chọn Đang hoạt động (rạp đang đóng): không nhắc hoàn tiền / huỷ suất", async () => {
    render(<CinemaStatusDialog cinema={{ ...cinema, status: "TEMP_CLOSED" }} open onOpenChange={vi.fn()} onChanged={vi.fn()} />);
    await pick("Đang hoạt động");
    expect(screen.getByText(/có hiệu lực vào 25\/11\/2026/)).toBeInTheDocument();
    expect(screen.queryByText(/hoàn tiền/)).not.toBeInTheDocument();
  });

  it("đã có lịch: hiện lịch hiện tại, mặc định là huỷ lịch (cảnh báo email đính chính), gửi status = trạng thái hiện tại", async () => {
    const onChanged = vi.fn();
    apiFetch.mockResolvedValue(result({ scheduledStatus: null, scheduledEffectiveAt: null, scheduleCancelled: true }));
    const { toast } = await import("sonner");
    const scheduled = { ...cinema, scheduledStatus: "CLOSED" as const, scheduledEffectiveAt: "2026-11-24T17:30:00.000Z" };
    render(<CinemaStatusDialog cinema={scheduled} open onOpenChange={vi.fn()} onChanged={onChanged} />);

    expect(screen.getByText(/Đang chờ: Ngừng hoạt động từ ngày 25\/11\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/Huỷ lịch sẽ giữ rạp ở trạng thái/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Huỷ lịch & gửi email đính chính" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(apiFetch).toHaveBeenCalledWith(`/admin/cinemas/${cinema.id}/status`, {
      method: "PATCH",
      json: { status: "OPEN" },
    });
    expect(vi.mocked(toast.success).mock.calls.at(-1)?.[0]).toMatch(/Đã huỷ lịch/);
  });

  it("đã có lịch: chọn trạng thái khác = hẹn lại (thay lịch cũ, gửi lại email)", async () => {
    apiFetch.mockResolvedValue(result({ scheduledStatus: "TEMP_CLOSED" }));
    const scheduled = { ...cinema, scheduledStatus: "CLOSED" as const, scheduledEffectiveAt: "2026-11-24T17:30:00.000Z" };
    render(<CinemaStatusDialog cinema={scheduled} open onOpenChange={vi.fn()} onChanged={vi.fn()} />);
    await pick("Tạm đóng");
    expect(screen.getByText(/thay lịch cũ và gửi lại email/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Hẹn đổi trạng thái & gửi email" }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(`/admin/cinemas/${cinema.id}/status`, {
        method: "PATCH",
        json: { status: "TEMP_CLOSED" },
      }),
    );
  });

  it("đang gửi: Esc / click ngoài / nút Đóng không đóng được dialog; bấm xác nhận 2 lần chỉ gọi API 1 lần", async () => {
    const onOpenChange = vi.fn();
    const onChanged = vi.fn();
    let finish: (value: unknown) => void = () => undefined;
    apiFetch.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<CinemaStatusDialog cinema={cinema} open onOpenChange={onOpenChange} onChanged={onChanged} />);
    await pick("Tạm đóng");

    const confirm = screen.getByRole("button", { name: "Hẹn đổi trạng thái & gửi email" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(apiFetch).toHaveBeenCalledTimes(1);

    await userEvent.keyboard("{Escape}");
    // Radix đặt pointer-events:none lên body khi modal mở nên dùng fireEvent cho "click ra ngoài".
    fireEvent.pointerDown(document.body);
    fireEvent.click(document.body);
    // Hai nút "Đóng": nút X của Radix (đi qua onOpenChange đã chặn) và nút ở chân dialog (bị khoá).
    const closers = screen.getAllByRole("button", { name: "Đóng" });
    expect(closers.some((button) => (button as HTMLButtonElement).disabled)).toBe(true);
    for (const button of closers) fireEvent.click(button);
    expect(onOpenChange).not.toHaveBeenCalled();

    finish(result({ scheduledStatus: "TEMP_CLOSED" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("lỗi API: hiện lỗi trong dialog, không gọi onChanged; không còn UI chặn suất đã bán (409)", async () => {
    const onChanged = vi.fn();
    apiFetch.mockRejectedValue(new ApiError("VALIDATION_ERROR", "Trạng thái không hợp lệ", 400));
    render(<CinemaStatusDialog cinema={cinema} open onOpenChange={vi.fn()} onChanged={onChanged} />);
    await pick("Tạm đóng");
    await userEvent.click(screen.getByRole("button", { name: "Hẹn đổi trạng thái & gửi email" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Trạng thái không hợp lệ");
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "Huỷ hàng loạt các suất" })).not.toBeInTheDocument();
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

  it("hẹn lịch xong: trạng thái hiện tại GIỮ NGUYÊN, chỉ thêm badge lịch chờ (R-136)", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path === "/me") return Promise.resolve({ id: "u", email: null, emailConfirmed: true, isAdmin: true, cinemas: [] });
      if (path === "/admin/cinemas") return Promise.resolve([{ ...cinema, roomCount: 1 }]);
      if (path === `/admin/cinemas/${cinema.id}/status`) {
        return Promise.resolve({
          success: true,
          cinemaId: cinema.id,
          status: "OPEN",
          scheduledStatus: "CLOSED",
          scheduledEffectiveAt: "2026-11-24T17:30:00.000Z",
          scheduleCancelled: false,
          emailsEnqueuedCount: 3,
        });
      }
      return Promise.reject(new Error(`unexpected ${path}`));
    });
    render(<AdminCinemasPage />);
    await userEvent.click(await screen.findByRole("button", { name: `Đổi trạng thái rạp ${cinema.name}` }));
    await userEvent.click(screen.getByRole("combobox", { name: "Trạng thái mới" }));
    await userEvent.click(await screen.findByRole("option", { name: "Ngừng hoạt động" }));
    await userEvent.click(screen.getByRole("button", { name: "Hẹn đổi trạng thái & gửi email" }));

    expect(await screen.findByText("Sẽ đóng cửa 25/11")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Đang hoạt động")).toBeInTheDocument();
    expect(screen.queryByText("Ngừng hoạt động")).not.toBeInTheDocument();
  });

  it("rạp có lịch chờ: Badge nhãn lịch + ngày hiệu lực (giờ VN); trạng thái hiện tại giữ nguyên", async () => {
    mockMe({ id: "u", email: null, emailConfirmed: true, isAdmin: true, cinemas: [] }, [
      { ...cinema, roomCount: 1, scheduledStatus: "CLOSED", scheduledEffectiveAt: "2026-11-24T17:30:00.000Z" },
    ]);
    render(<AdminCinemasPage />);
    expect(await screen.findByText("Sẽ đóng cửa 25/11")).toBeInTheDocument();
    expect(screen.getByText("Đang hoạt động")).toBeInTheDocument();
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
