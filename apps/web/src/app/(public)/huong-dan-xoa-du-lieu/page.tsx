import type { Metadata } from "next";
import { LEGAL_DRAFT_NOTICE, LEGAL_META_LINE } from "@/lib/legal";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Hướng dẫn xoá dữ liệu",
  description: "Cách yêu cầu xoá tài khoản và dữ liệu cá nhân của bạn trên CINEMO, gồm dữ liệu đăng nhập Facebook.",
};

export default function DataDeletionPage() {
  return (
    <article className="mx-auto w-full max-w-3xl text-base leading-[1.7] text-fg-secondary">
      <h1 className="text-h1 font-bold text-fg">Hướng dẫn xoá dữ liệu</h1>
      <p className="mt-1 text-small text-fg-muted">{LEGAL_META_LINE}</p>
      <p className="mt-4 rounded-md border border-warning-line bg-warning-soft p-3 text-body-sm text-warning">
        {LEGAL_DRAFT_NOTICE}
      </p>

      <h2 className="mt-8 text-h2 font-bold text-fg">Cách 1: Tự xoá trong tài khoản</h2>
      <ol className="mt-2 list-decimal space-y-1 pl-6">
        <li>
          Đăng nhập và vào{" "}
          <Link href="/tai-khoan" className="text-link hover:underline">
            Tài khoản
          </Link>
          .
        </li>
        <li>
          Chọn mục xoá tài khoản. Hệ thống cảnh báo <strong>vé chưa sử dụng sẽ mất hiệu lực</strong>; bạn cần xác nhận
          lại bằng mật khẩu (hoặc đăng nhập lại Google/Facebook) để hoàn tất.
        </li>
        <li>Hệ thống ẩn danh hoá thông tin cá nhân của bạn và gửi email xác nhận.</li>
      </ol>

      <h2 className="mt-8 text-h2 font-bold text-fg">Cách 2: Yêu cầu qua email (gồm dữ liệu đăng nhập Facebook)</h2>
      <p>
        Nếu bạn đã đăng nhập bằng Facebook và muốn xoá dữ liệu liên quan, gửi email tới địa chỉ hỗ trợ của CINEMO (sẽ
        được cập nhật khi go-live) từ email gắn với tài khoản, tiêu đề &quot;Yêu cầu xoá dữ liệu&quot;. Bạn cũng có thể
        gỡ ứng dụng CINEMO trong phần Cài đặt &gt; Ứng dụng và trang web của Facebook, sau đó gửi yêu cầu để chúng tôi
        xoá dữ liệu đã lưu.
      </p>

      <h2 className="mt-8 text-h2 font-bold text-fg">Thời gian xử lý</h2>
      <p>
        [Thời hạn xử lý sẽ được công bố trước go-live.] Chúng tôi gửi email xác nhận khi hoàn tất.
      </p>

      <h2 className="mt-8 text-h2 font-bold text-fg">Dữ liệu có thể được giữ lại</h2>
      <p>
        Dữ liệu giao dịch cần thiết cho nghĩa vụ kế toán, thuế hoặc giải quyết tranh chấp có thể được giữ lại ở dạng ẩn
        danh trong thời hạn luật định. Xem thêm{" "}
        <Link href="/chinh-sach-bao-mat" className="text-link hover:underline">
          Chính sách bảo mật
        </Link>
        .
      </p>
    </article>
  );
}
