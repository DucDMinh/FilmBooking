# builder · feature-order-level-qr phase-1-task-01 (DB)
Xong: migration 20261117120000_order_level_qr.sql (orders.qr_token + checkin_ticket soát cả đơn), áp lên DB local; test 063 (57), 064 (race, 5), sửa 044 (plan 45); database.types.ts sinh lại; decisions.md append.
Verify: pgTAP chạy bằng wrapper truncate-trong-transaction vì DB local có demo data (provinces trùng tên làm hầu hết test fixture hỏng sẵn). Còn dở: không (chờ reviewer STRICT).
