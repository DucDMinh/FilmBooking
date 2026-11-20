# builder · bug-oauth-collision-message · phase-1-task-01

- Đã làm: route.ts thêm `isMaskedIdentityCreationError` + `classifyQueryError` (theo ngữ cảnh login/link) + console.warn allowlist; route.test.ts thêm 10 test (đỏ -> xanh).
- Verify: web lint/typecheck/test (682)/build PASS.
- Còn dở: không. Residual: Facebook chưa có log thực; luồng exchangeError (code flow) không áp dụng nhận diện che.
