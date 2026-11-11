import type { Metadata } from "next";
import { LEGAL_DRAFT_NOTICE, LEGAL_META_LINE } from "@/lib/legal";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Chính sách bảo mật",
  description: "Cách CINEMO thu thập, sử dụng và bảo vệ dữ liệu cá nhân theo Nghị định 13/2023/NĐ-CP.",
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto w-full max-w-3xl text-base leading-[1.7] text-fg-secondary">
      <h1 className="text-h1 font-bold text-fg">Chính sách bảo mật</h1>
      <p className="mt-1 text-small text-fg-muted">{LEGAL_META_LINE}</p>
      <p className="mt-4 rounded-md border border-warning-line bg-warning-soft p-3 text-body-sm text-warning">
        {LEGAL_DRAFT_NOTICE}
      </p>

      <h2 className="mt-8 text-h2 font-bold text-fg">1. Căn cứ pháp lý</h2>
      <p>
        Chính sách này được lập theo Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân và các quy định liên quan. CINEMO
        là bên kiểm soát dữ liệu cá nhân của bạn khi bạn sử dụng dịch vụ.
      </p>

      <h2 className="mt-8 text-h2 font-bold text-fg">2. Dữ liệu chúng tôi thu thập</h2>
      <ul className="mt-2 list-disc space-y-1 pl-6">
        <li>Thông tin tài khoản: họ tên, email, số điện thoại (nếu bạn cung cấp), ngày sinh (để kiểm tra độ tuổi phim).</li>
        <li>Thông tin đăng nhập qua Google hoặc Facebook: mã định danh và email do nhà cung cấp trả về.</li>
        <li>Thông tin đơn hàng: suất chiếu, ghế, số tiền, trạng thái thanh toán, mã vé.</li>
        <li>
          Vị trí: nếu bạn cho phép, vị trí chỉ được dùng ngay trên trình duyệt của bạn để gợi ý rạp gần nhất;
          chúng tôi <strong>không lưu toạ độ</strong>.
        </li>
        <li>Dữ liệu kỹ thuật: địa chỉ IP, thiết bị, nhật ký truy cập phục vụ bảo mật và chống gian lận.</li>
      </ul>

      <h2 className="mt-8 text-h2 font-bold text-fg">3. Mục đích sử dụng</h2>
      <p>
        Xác thực tài khoản, giữ ghế và xử lý đơn hàng, gửi vé và thông báo liên quan đến đơn, chống gian lận, tuân thủ
        nghĩa vụ pháp lý. Chúng tôi chỉ gửi nội dung khuyến mãi khi bạn đồng ý rõ ràng và bạn có thể rút lại bất kỳ lúc
        nào.
      </p>

      <h2 className="mt-8 text-h2 font-bold text-fg">4. Chia sẻ dữ liệu</h2>
      <p>
        Chúng tôi không bán dữ liệu cá nhân. Dữ liệu chỉ được chia sẻ với đơn vị xử lý thanh toán, dịch vụ gửi email,
        hạ tầng lưu trữ và cơ quan nhà nước có thẩm quyền khi pháp luật yêu cầu.
      </p>

      <h2 className="mt-8 text-h2 font-bold text-fg">5. Thời gian lưu trữ và bảo mật</h2>
      <p>
        Dữ liệu được lưu trong thời gian tài khoản còn hoạt động và theo thời hạn luật định đối với chứng từ giao dịch.
        Mật khẩu được băm, kết nối được mã hoá, quyền truy cập dữ liệu được phân theo vai trò.
      </p>

      <h2 className="mt-8 text-h2 font-bold text-fg">6. Quyền của chủ thể dữ liệu</h2>
      <p>
        Bạn có quyền được biết, đồng ý hoặc rút lại sự đồng ý, truy cập, chỉnh sửa, hạn chế, phản đối xử lý và yêu cầu
        xoá dữ liệu. Để xoá dữ liệu, xem{" "}
        <Link href="/huong-dan-xoa-du-lieu" className="text-link hover:underline">
          Hướng dẫn xoá dữ liệu
        </Link>
        . Lưu ý: dữ liệu giao dịch có thể được giữ lại ở dạng ẩn danh hoặc theo thời hạn luật định.
      </p>

      <h2 className="mt-8 text-h2 font-bold text-fg">7. Liên hệ</h2>
      <p>Mọi yêu cầu về dữ liệu cá nhân, vui lòng gửi tới email hỗ trợ của CINEMO (sẽ được cập nhật khi go-live).</p>
    </article>
  );
}
