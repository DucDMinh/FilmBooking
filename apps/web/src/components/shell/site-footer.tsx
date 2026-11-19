import Link from "next/link";

import { Scrub, ScrubGroup } from "@/components/motion/scrub";

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
 * Chuyển động nhóm B (§16.4): một timeline chung cho cả hàng cột, cột lẻ vào từ trái, cột chẵn từ phải.
 * Footer nằm cuối trang, không còn chỗ cuộn để vượt inset đáy nên nhóm kèm `scrub-inset-0`.
 */
export function SiteFooter() {
  return (
    <footer className="overflow-x-clip border-t border-border bg-chrome">
      <ScrubGroup
        n={4}
        className="scrub-inset-0 mx-auto grid w-full max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 md:px-6 lg:grid-cols-[1.4fr_1fr_1fr_1fr]"
      >
        <Scrub kind="left" i={0} className="flex flex-col gap-3">
          <span className="font-display text-base font-heavy tracking-[0.02em] text-fg">CINEMO</span>
          <p className="max-w-[30ch] text-body-sm text-fg-secondary">
            Đặt vé xem phim tại chuỗi rạp CINEMO. Vé chỉ có giá trị tại rạp và suất chiếu ghi trên vé.
          </p>
        </Scrub>
        <Scrub kind="right" i={1}>
          <FooterColumn title="Rạp chiếu" links={CINEMA_LINKS} />
        </Scrub>
        <Scrub kind="left" i={2}>
          <FooterColumn title="Hỗ trợ" links={SUPPORT_LINKS} />
        </Scrub>
        <Scrub kind="right" i={3}>
          <FooterColumn title="Pháp lý" links={LEGAL_LINKS} />
        </Scrub>
      </ScrubGroup>
      <p className="mx-auto w-full max-w-7xl px-4 pb-8 text-small text-fg-muted md:px-6">
        © CINEMO. Vé đã mua không hỗ trợ huỷ hoặc hoàn tiền.
      </p>
    </footer>
  );
}
