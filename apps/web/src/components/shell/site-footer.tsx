import Link from "next/link";

export const LEGAL_LINKS = [
  { href: "/dieu-khoan", label: "Điều khoản sử dụng" },
  { href: "/chinh-sach-bao-mat", label: "Chính sách bảo mật" },
  { href: "/huong-dan-xoa-du-lieu", label: "Hướng dẫn xoá dữ liệu" },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-chrome">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-8 md:px-6">
        <nav aria-label="Liên kết pháp lý" className="flex flex-wrap gap-x-2 gap-y-1">
          {LEGAL_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex min-h-11 items-center rounded-sm px-2 text-small text-fg-secondary hover:text-fg"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <p className="text-small text-fg-muted">
          © CINEMO. Vé đã mua không hỗ trợ huỷ hoặc hoàn tiền. Vé chỉ có giá trị tại rạp và suất chiếu ghi trên vé.
        </p>
      </div>
    </footer>
  );
}
