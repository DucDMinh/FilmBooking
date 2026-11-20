---
id: select-dropdown-theme
type: bug
status: done
created: 2026-11-20
---

# Ô chọn (select) và danh sách xổ xuống không đồng bộ giao diện CYBERPLEX, đang trông như mặc định của Windows

## Yêu cầu
Các ô chọn có danh sách xổ xuống (`<select>` gốc) trên web đang hiện popup mặc định của hệ điều hành
(nền trắng/xám Windows, chữ hệ thống), lệch hẳn giao diện CYBERPLEX. Sửa để ô đóng lẫn danh sách xổ ra
dùng đúng token của site (nền tối, viền, chữ, màu nhấn vàng).

## Bối cảnh / tái hiện (bug)
- Màn/route/role: mọi màn có `<select>` gốc, 13 file / 23 ô: công khai (`/phim` bộ lọc, `/lich-chieu` bộ lọc, thanh Đặt vé nhanh ở trang chủ) và admin (lịch chiếu, đơn hàng, voucher, gán vai trò, khoá ghế, nhật ký, đơn bị ảnh hưởng, nhân sự rạp).
- Bước tái hiện: mở một ô chọn bất kỳ ở trên, bấm để xổ danh sách.
- Expected: danh sách xổ ra vuông, nền tối `popover`, viền `border`, mục đang chọn/đang rê có nhấn vàng, theo design-spec (`Input/Select/Textarea`: vuông, nền `surface-input`, viền `border-input`, focus viền vàng).
- Actual: danh sách là popup gốc của Windows; ô đóng thì chỗ có viền `border-input`, chỗ `bg-transparent`, chỗ không có mũi tên riêng, class rải rác ở nhiều file.

## Acceptance (bắt buộc)
- [x] Danh sách xổ xuống của mọi `<select>` gốc dùng token site (nền, chữ, viền, hover/chọn) trên Chrome/Edge; trình duyệt chưa hỗ trợ giữ popup gốc nhưng nền tối đúng `color-scheme: dark`.
- [x] Ô đóng của 23 ô đồng nhất một kiểu (vuông, `surface-input`, `border-input`, mũi tên, focus vàng, disabled mờ), không còn class lệch rải rác.
- [x] Không đổi hành vi: giá trị `""` ("Tất cả"), `onChange`, `disabled`, `name`, `aria-*`; `QuickBookBar` vẫn chặn mở khi `onBlocked`, opacity luôn 1, không đổi chiều cao/layout (bộ kiểm cuộn Playwright vẫn xanh).
- [x] Có kiểm bằng mắt (screenshot khi popup mở) cho 1 màn công khai + 1 màn admin.
- [x] lint / typecheck / test / build web PASS.

## Ghi chú
Tham chiếu design-spec "Input/Select/Textarea" và §QuickBookBar ("4 `<select>` gốc"). Giữ `<select>` gốc (không đổi sang Radix) vì
design-spec chốt select gốc cho QuickBookBar, Radix không nhận `value=""`, và 5 file test dùng `selectOptions`. Không đổi requirement → không bump `spec_version`.
