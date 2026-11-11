import "@testing-library/jest-dom/vitest";

import { AGE_RATINGS } from "@filmbooking/shared";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import PrivacyPage, { metadata as privacyMeta } from "@/app/(public)/chinh-sach-bao-mat/page";
import TermsPage, { metadata as termsMeta } from "@/app/(public)/dieu-khoan/page";
import DeletionPage, { metadata as deletionMeta } from "@/app/(public)/huong-dan-xoa-du-lieu/page";
import { SiteHeader } from "@/components/shell/site-header";
import { LEGAL_DRAFT_NOTICE } from "@/lib/legal";

vi.mock("next/navigation", () => ({ usePathname: () => "/phim" }));

import { LEGAL_LINKS, SiteFooter } from "@/components/shell/site-footer";

import { AgeBadge } from "../age-badge";
import { DateTime, Money } from "../money";
import { EmptyState, ErrorState, LoadingState } from "../states";

afterEach(cleanup);

describe("Money / DateTime", () => {
  it("Money hiển thị 120.000 ₫", () => {
    render(<Money amount={120000} />);
    expect(screen.getByText("120.000 ₫")).toBeInTheDocument();
  });

  it("DateTime hiển thị theo giờ VN (UTC+7)", () => {
    render(<DateTime value="2026-11-14T10:00:00Z" />);
    expect(screen.getByText("17:00 14/11/2026")).toHaveAttribute("datetime", "2026-11-14T10:00:00.000Z");
  });
});

describe("AgeBadge", () => {
  it.each(AGE_RATINGS)("nhãn %s có chữ và mô tả cho screen reader", (rating) => {
    render(<AgeBadge rating={rating} />);
    const badge = screen.getByRole("img", { name: new RegExp(`^Phân loại ${rating}: `) });
    expect(badge).toHaveTextContent(rating);
  });

  it("T16 mô tả đúng độ tuổi", () => {
    render(<AgeBadge rating="T16" tone="semantic" />);
    expect(
      screen.getByRole("img", { name: "Phân loại T16: phim dành cho khán giả từ 16 tuổi trở lên" }),
    ).toBeInTheDocument();
  });
});

describe("states", () => {
  it("EmptyState có tiêu đề, mô tả và CTA", () => {
    render(<EmptyState title="Chưa có vé" description="Bạn chưa đặt vé nào." action={<a href="/phim">Xem phim</a>} />);
    expect(screen.getByRole("heading", { name: "Chưa có vé" })).toBeInTheDocument();
    expect(screen.getByText("Bạn chưa đặt vé nào.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem phim" })).toBeInTheDocument();
  });

  it("ErrorState là alert, nút Thử lại gọi onRetry", async () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Không tải được dữ liệu");
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("ErrorState không có nút khi không truyền onRetry", () => {
    render(<ErrorState />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("LoadingState là status busy với nhãn cho screen reader", () => {
    render(<LoadingState rows={2} />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("Đang tải…");
  });
});

describe("SiteFooter", () => {
  it("có link tới cả 3 trang pháp lý", () => {
    render(<SiteFooter />);
    for (const item of LEGAL_LINKS) {
      expect(screen.getByRole("link", { name: item.label })).toHaveAttribute("href", item.href);
    }
    expect(LEGAL_LINKS.map((i) => i.href)).toEqual([
      "/dieu-khoan",
      "/chinh-sach-bao-mat",
      "/huong-dan-xoa-du-lieu",
    ]);
  });
});

describe("DateTime không hợp lệ", () => {
  it("hiển thị — thay vì ném lỗi", () => {
    render(<DateTime value="khong-phai-ngay" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("SiteHeader", () => {
  it("có nav Phim/Rạp/Lịch chiếu, ẩn Khuyến mãi, đánh dấu trang hiện tại", () => {
    render(<SiteHeader />);
    const nav = screen.getByRole("navigation", { name: "Điều hướng chính" });
    expect(nav).toHaveTextContent("Phim");
    expect(nav).toHaveTextContent("Rạp");
    expect(nav).toHaveTextContent("Lịch chiếu");
    expect(screen.queryByText(/Khuyến mãi/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Phim" })).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("link", { name: "Đăng nhập" })[0]).toHaveAttribute("href", "/dang-nhap");
  });

  it("nút menu có aria-expanded và mở Sheet điều hướng", async () => {
    render(<SiteHeader />);
    const button = screen.getByRole("button", { name: "Mở menu" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(button);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Điều hướng di động" })).toBeInTheDocument();
  });

  it("đã đăng nhập: link tài khoản trỏ /tai-khoan", () => {
    render(<SiteHeader user={{ displayName: "An" }} />);
    expect(screen.getByRole("link", { name: "An" })).toHaveAttribute("href", "/tai-khoan");
  });
});

describe("trang pháp lý", () => {
  it("Điều khoản: title, bản nháp, ngoại lệ đúng R-134, không còn 'sự cố'", () => {
    const { container } = render(<TermsPage />);
    expect(termsMeta.title).toBe("Điều khoản sử dụng");
    expect(screen.getByRole("heading", { level: 1, name: "Điều khoản sử dụng" })).toBeInTheDocument();
    expect(screen.getByText(LEGAL_DRAFT_NOTICE)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "4. Không huỷ – Không hoàn" })).toBeInTheDocument();
    const text = container.textContent ?? "";
    expect(text).toContain("rạp huỷ suất chiếu hoặc rạp đóng cửa");
    expect(text).toContain("hoàn tiền thủ công");
    expect(text).not.toContain("sự cố");
  });

  it("Bảo mật: NĐ 13/2023 và không lưu toạ độ", () => {
    const { container } = render(<PrivacyPage />);
    expect(privacyMeta.title).toBe("Chính sách bảo mật");
    expect(screen.getByText(LEGAL_DRAFT_NOTICE)).toBeInTheDocument();
    expect(container.textContent).toContain("13/2023/NĐ-CP");
    expect(container.textContent).toContain("không lưu toạ độ");
  });

  it("Xoá dữ liệu: cảnh báo vé mất hiệu lực, không cam kết 72 giờ", () => {
    const { container } = render(<DeletionPage />);
    expect(deletionMeta.title).toBe("Hướng dẫn xoá dữ liệu");
    expect(screen.getByText(LEGAL_DRAFT_NOTICE)).toBeInTheDocument();
    expect(container.textContent).toContain("vé chưa sử dụng sẽ mất hiệu lực");
    expect(container.textContent).not.toContain("72");
  });
});
