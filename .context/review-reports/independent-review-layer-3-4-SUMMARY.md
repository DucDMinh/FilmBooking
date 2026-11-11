# Review độc lập Layer 3 + 4 — Tổng hợp (2026-11-11)

Bối cảnh: Layer 3 và 4 do một agent khác làm khi bên điều phối hết quota; toàn bộ báo cáo review cũ đều ghi "STRICT PASS" và bỏ sót các lỗi dưới đây. Review này đọc code thật (HEAD `cece676`), không dựa báo cáo cũ.

Báo cáo chi tiết (kèm `file:dòng`, kịch bản, đề xuất sửa):
- DB: `independent-review-layer-3-4-db.md` — FAIL (3 CRITICAL, ≥10 MAJOR)
- API: `independent-review-layer-3-4-api.md` — FAIL (3 CRITICAL, 11 MAJOR, 17 MINOR)
- Web + seed + CI + quy trình: `independent-review-layer-3-4-web-seed-ci.md` — FAIL cả 4 mục (1 CRITICAL, nhiều MAJOR)

Mức xác minh: [V] = dispatcher tự chứng minh bằng chạy thật/đọc code; [R] = do reviewer đọc code, chưa chạy.

## CRITICAL (6 lỗi khác nhau)
| # | Lỗi | Xác minh |
|---|---|---|
| K1 | RPC identity (`link/unlink_user_identity`, `get_user_identities`, `mark_password_set`) cho `anon` gọi được; kiểm quyền bị bỏ qua khi `auth.uid()` null → chiếm tài khoản bất kỳ (migration `20261111040500_identity_hooks.sql`) | [V] DB thật: `has_function_privilege('anon',…)` = true ×4, gọi `get_user_identities` thành công |
| K2 | Liên kết MXH không cần bằng chứng sở hữu: `providerId`/`identityData` do client khai (`identity.service.ts:77-97`) | [R] |
| K3 | Oracle dò email công khai (`/auth/oauth/callback-check` `@Public` + `check_oauth_collision` grant anon) — vi phạm R-12 | [R] |
| K4 | Bán trùng ghế: `confirm_paid` upsert không điều kiện, hai đơn hết hạn cùng giữ 1 ghế + tiền về muộn đồng thời → cả hai `paid` (`040100_rpc_payment.sql:404-407,551-554,847-850`); `tickets` không có unique ghế×suất | [R] |
| K5 | Rate limit voucher (R-95) không hoạt động: bộ đếm bị rollback cùng `raise`; test tự bơm sẵn số lượt (`042_voucher.test.sql:449-463`) | [R] |
| K6 | XSS popup bản đồ: `${cinemaName}`/`${address}` ghép vào HTML `bindPopup` không escape (`cinema-map.tsx:115-132`); Manager sửa được tên/địa chỉ rạp | [V] đọc code |

## MAJOR chính
DB/booking: đơn `pending_payment` không bao giờ hết hạn, tiền về muộn vẫn chốt bán sau khi suất đóng/đã chiếu (#17) · tạo đơn mới không huỷ đơn `pending_payment` cũ (R-64/#9) · race huỷ suất ↔ giữ ghế/thanh toán (đơn paid trên suất đã huỷ) · voucher CONSUMED sai ở tiền về muộn · khoá ghế giữa chừng làm webhook rollback + PayOS retry vô hạn · `hold_seats` không kiểm trạng thái rạp (TEMP_CLOSED vẫn đặt được) · `set_cinema_status` cho Manager (spec: chỉ Admin), Staff xem được báo cáo doanh thu · tra `request_id` POS trước kiểm quyền (lộ đơn POS) · `confirm_paid:502` đọc cấu hình sai (`value->>0`) → mốc đóng bán luôn 15' · email trùng khi retry/chạy lại huỷ suất · **không có test đồng thời thật** (2 phiên) cho bất biến không bán trùng ghế (NFR-02/17).
API: `mark_password_set` + `unlink` không khoá dòng → lách "không huỷ phương thức cuối" (AC-05) · `resetPassword` nhận mọi access token (không kiểm `amr` recovery, không dùng một lần), GoTrue `updateUser` trực tiếp bỏ qua hạn 1h · xác nhận lại khi xoá tài khoản OAuth dựa `iat` (refresh ngầm luôn mới) · R-20 chưa đủ (GoTrue vẫn tự gộp Facebook vào tài khoản chỉ có Google) · pricing dùng service role (mất audit actor, báo giá suất phim nháp/đã huỷ, nuốt lỗi, lộ message DB) · catalog lấy suất không giới hạn (cắt im lặng ở 1000) · `replaceSeats` xoá rồi chèn không atomic · proxy Next không chuyển `X-Forwarded-For` → rate limit IP thành giới hạn chung cả site.
Web: lịch 7 ngày / `/lich-chieu` không hoạt động · chọn khu vực chưa hoàn chỉnh (R-35, không lưu hồ sơ) · phim hết chiếu hiện "Đang chiếu" + nút đặt vé · lỗi API biến thành 404 · không có `loading.tsx`, `/phim` thiếu bộ lọc · không có `llms.txt`.
Seed/CI/quy trình: seed tự nạp làm hỏng 10/14 file pgTAP và CI [V] · không có chặn chạy seed lên DB thật, chạy lại nhân đôi dữ liệu, `current_date` UTC · `progress.json` thiếu review của 12 task Layer 4, tag `layer-4-done` + phase review ghi COMPLETE dù CI đỏ · `.env.example` thiếu `SUPABASE_JWKS_URL`, `SUPABASE_JWT_ISSUER`, `TRUST_PROXY_HOPS`, `NEXT_PUBLIC_SITE_URL` · `db:types` redirect `>` vẫn có thể làm trắng file.

## Điểm đạt
AuthGuard/JWKS (chặn alg confusion/none, fail-closed, iss/aud/exp, không log JWT) · lint/typecheck/build/unit test xanh · khi tắt seed: pgTAP 14 file / 566 test PASS [V] · hai hàm JSON-LD đã escape `<` · migration toàn bộ additive.

## Đề xuất thứ tự sửa
P0 (bảo mật, làm ngay, 1 migration mới + code): K1, K2, K3, K6; K4, K5; test phân quyền theo role (`set role anon/authenticated`) cho MỌI hàm SECURITY DEFINER; sửa seed (tắt nạp tự động + `db:seed:demo` có guard) để pgTAP/CI xanh lại.
P1 (đúng nghiệp vụ đặt vé): nhóm MAJOR DB/booking + test đồng thời bằng dblink.
P2: MAJOR API còn lại (reset password, xoá tài khoản, pricing, catalog, proxy XFF) + web.
P3: quy trình (`progress.json`, `.env.example`, `db:types`, ERD/PLAN), MINOR.
