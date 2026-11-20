# builder · bug-refund-method-required phase-1 task-01
Done: shared recordRefundSchema (+refundMethod, refundedAt, nhãn VI, vnTodayIsoDate); migration 20261120100000 (cột nullable + CHECK NOT VALID, không backfill); API/CSV/DTO; web form + chi tiết + danh sách + order-detail; docs API_SPEC/ERD; test shared/API e2e+int/web/pgTAP 070.
Verify: lint, typecheck, test (shared 39, api 679, web 669), build OK; pgTAP 070 14/14 PASS; 031/044 đỏ vì provinces_name_key có sẵn (DB demo bẩn).
Còn: chưa commit (dispatcher lo).
