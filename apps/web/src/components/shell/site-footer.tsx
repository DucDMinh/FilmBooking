import Link from "next/link";

export const LEGAL_LINKS = [
  { href: "/dieu-khoan", label: "Điều khoản sử dụng" },
  { href: "/chinh-sach-bao-mat", label: "Chính sách bảo mật" },
  { href: "/huong-dan-xoa-du-lieu", label: "Hướng dẫn xoá dữ liệu" },
] as const;

const CINEMA_LINKS = [
  { href: "/rap", label: "Danh sách rạp" },
  { href: "/lich-chieu", label: "Lịch chiếu" },
] as const;

const SUPPORT_LINKS = [
  { href: "/ve", label: "Vé của tôi" },
  { href: "/tai-khoan", label: "Tài khoản" },
] as const;

const columnLinkClass =
  "inline-flex min-h-11 w-fit items-center text-body-sm text-fg-secondary transition-colors hover:text-brand";

function FooterColumn({
  title,
  links,
}: Readonly<{ title: string; links: ReadonlyArray<{ href: string; label: string }> }>) {
  return (
    <nav aria-label={title} className="flex flex-col gap-1">
      <span className="hud">{title}</span>
      {links.map((item) => (
        <Link key={item.href} href={item.href} className={columnLinkClass}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Footer 4 cột (design-spec §16.3): thương hiệu, Rạp, Hỗ trợ, Pháp lý.
 * Chưa gắn scrub: khi gắn ở task sau, footer phải kèm `scrub-inset-0` (không còn chỗ cuộn để vượt inset đáy).
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-chrome">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 md:px-6 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="flex flex-col gap-3">
          <span className="font-display text-base font-heavy tracking-[0.02em] text-fg">CINEMO</span>
          <p className="max-w-[30ch] text-body-sm text-fg-secondary">
            Đặt vé xem phim tại chuỗi rạp CINEMO. Vé chỉ có giá trị tại rạp và suất chiếu ghi trên vé.
          </p>
        </div>
        <FooterColumn title="Rạp chiếu" links={CINEMA_LINKS} />
        <FooterColumn title="Hỗ trợ" links={SUPPORT_LINKS} />
        <FooterColumn title="Pháp lý" links={LEGAL_LINKS} />
      </div>
      <p className="mx-auto w-full max-w-7xl px-4 pb-8 text-small text-fg-muted md:px-6">
        © CINEMO. Vé đã mua không hỗ trợ huỷ hoặc hoàn tiền.
      </p>
    </footer>
  );
}
