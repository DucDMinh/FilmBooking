import type { Metadata } from "next";
import { LEGAL_DRAFT_NOTICE, LEGAL_META_LINE } from "@/lib/legal";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Điều khoản sử dụng",
  description: "Điều khoản sử dụng dịch vụ đặt vé xem phim CINEMO, gồm chính sách không huỷ – không hoàn vé.",
};

const SECTIONS = [
  { id: "pham-vi", title: "1. Phạm vi và chấp thuận" },
  { id: "tai-khoan", title: "2. Tài khoản" },
  { id: "dat-ve", title: "3. Đặt vé và thanh toán" },
  { id: "khong-huy-khong-hoan", title: "4. Không huỷ – Không hoàn" },
  { id: "do-tuoi", title: "5. Phân loại độ tuổi" },
  { id: "huy-suat", title: "6. Suất chiếu bị huỷ bởi rạp" },
  { id: "lien-he", title: "7. Liên hệ" },
] as const;

export default function TermsPage() {
  return (
    <article className="mx-auto w-full max-w-3xl text-base leading-[1.7] text-fg-secondary">
      <h1 className="text-h1 font-bold text-fg">Điều khoản sử dụng</h1>
      <p className="mt-1 text-small text-fg-muted">{LEGAL_META_LINE}</p>
      <p className="mt-4 rounded-md border border-warning-line bg-warning-soft p-3 text-body-sm text-warning">
        {LEGAL_DRAFT_NOTICE}
      </p>

      <nav aria-label="Mục lục" className="mt-6 rounded-lg border border-border-subtle bg-surface p-4">
        <p className="text-small font-bold uppercase tracking-wider text-fg-muted">Mục lục</p>
        <ul className="mt-2">
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`} className="inline-flex min-h-11 items-center text-link hover:underline">
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <section id="pham-vi" className="scroll-mt-20">
        <h2 className="mt-8 text-h2 font-bold text-fg">1. Phạm vi và chấp thuận</h2>
        <p>
          Khi truy cập website hoặc đặt vé qua CINEMO, bạn đồng ý với các điều khoản dưới đây. Nếu không đồng ý, vui
          lòng ngừng sử dụng dịch vụ. Việc xử lý dữ liệu cá nhân được nêu tại{" "}
          <Link href="/chinh-sach-bao-mat" className="text-link hover:underline">
            Chính sách bảo mật
          </Link>
          .
        </p>
      </section>

      <section id="tai-khoan" className="scroll-mt-20">
        <h2 className="mt-8 text-h2 font-bold text-fg">2. Tài khoản</h2>
        <p>
          Bạn cần có tài khoản đã xác nhận email để đặt vé. Bạn chịu trách nhiệm bảo mật thông tin đăng nhập và mọi
          hoạt động phát sinh từ tài khoản của mình. Chúng tôi có quyền tạm khoá tài khoản khi phát hiện dấu hiệu gian
          lận hoặc vi phạm điều khoản.
        </p>
      </section>

      <section id="dat-ve" className="scroll-mt-20">
        <h2 className="mt-8 text-h2 font-bold text-fg">3. Đặt vé và thanh toán</h2>
        <p>
          Ghế được giữ trong thời gian giới hạn hiển thị trên màn hình đặt vé; hết thời gian, ghế được nhả và đơn hàng
          hết hạn. Thanh toán bằng chuyển khoản VietQR; đơn chỉ được xác nhận khi hệ thống ghi nhận thanh toán thành
          công. Giá hiển thị bằng đồng Việt Nam (₫), đã bao gồm thuế, phí. Vé điện tử chỉ có giá trị tại rạp, phòng và
          suất chiếu ghi trên vé.
        </p>
      </section>

      <section id="khong-huy-khong-hoan" className="scroll-mt-20">
        <h2 className="mt-8 text-h2 font-bold text-fg">4. Không huỷ – Không hoàn</h2>
        <div className="mt-3 rounded-md border border-danger-line bg-danger-soft p-4 text-body-sm text-fg">
          <p className="font-extrabold uppercase tracking-wide text-danger-strong">Lưu ý quan trọng</p>
          <p className="mt-1">
            Sau khi thanh toán thành công, vé <strong>không được huỷ, không được đổi, không được hoàn tiền</strong>,
            kể cả khi bạn đặt nhầm rạp, nhầm suất, nhầm ghế hoặc không thể đến xem. Hãy kiểm tra kỹ tên rạp, địa chỉ,
            giờ chiếu và ghế trước khi thanh toán.
          </p>
        </div>
        <p className="mt-3">
          Ngoại lệ duy nhất: rạp huỷ suất chiếu hoặc rạp đóng cửa (xem mục 6). Mọi khoản hoàn tiền đều được thực hiện
          thủ công, ngoài hệ thống đặt vé.
        </p>
      </section>

      <section id="do-tuoi" className="scroll-mt-20">
        <h2 className="mt-8 text-h2 font-bold text-fg">5. Phân loại độ tuổi</h2>
        <p>
          Phim được phân loại P, K, T13, T16, T18 theo quy định hiện hành. Với phim T13, T16, T18, bạn cam kết người
          xem đủ tuổi theo quy định. Nhân viên rạp có quyền yêu cầu xuất trình giấy tờ và từ chối vào phòng chiếu nếu
          không đủ điều kiện; vé trong trường hợp này không được hoàn.
        </p>
      </section>

      <section id="huy-suat" className="scroll-mt-20">
        <h2 className="mt-8 text-h2 font-bold text-fg">6. Suất chiếu bị huỷ bởi rạp</h2>
        <p>
          Nếu rạp huỷ suất chiếu, bạn sẽ nhận email thông báo kèm hướng xử lý và hotline của rạp: bạn có thể mang mã đặt
          vé tới quầy để đổi sang suất khác, hoặc liên hệ rạp để được hoàn tiền thủ công nếu bạn đồng ý. Nếu rạp đóng
          cửa, rạp sẽ chủ động liên hệ để hoàn tiền thủ công cho các đơn của suất chiếu tương lai.
        </p>
        <p>
          Hoàn tiền luôn được thực hiện thủ công ngoài hệ thống; hệ thống chỉ ghi nhận để đối soát. Nếu bạn chuyển khoản
          sai số tiền, đơn sẽ không được xác nhận và giao dịch được đưa vào đối soát.
        </p>
      </section>

      <section id="lien-he" className="scroll-mt-20">
        <h2 className="mt-8 text-h2 font-bold text-fg">7. Liên hệ</h2>
        <p>
          Mọi thắc mắc về điều khoản, vui lòng liên hệ bộ phận hỗ trợ của CINEMO (email và hotline sẽ được cập nhật khi
          go-live).
        </p>
      </section>
    </article>
  );
}
