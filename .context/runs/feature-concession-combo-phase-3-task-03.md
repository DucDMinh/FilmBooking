# Run Journal — feature/concession-combo · phase-3-task-03

```yaml
workItem: feature/concession-combo
phaseTask: phase-3-task-03
step: done
agent: spec-validator
status: done
attempt: 2
interrupted: false
updatedAt: 2026-11-23T07:56:51.281Z
filesTouched:
  - apps/web/src/components/booking/order-summary.tsx
  - apps/web/src/app/(public)/dat-ve/don/[id]/xac-nhan/page.tsx
  - apps/web/src/components/ticket/ticket-data.ts
  - apps/web/src/components/ticket/ticket-card.tsx
  - apps/web/src/components/staff/checkin-result.tsx
  - apps/web/src/components/common/remote-image.tsx
  - packages/shared/src/schemas/booking.ts
  - docs/API_SPEC.md
  - docs/changes/TECHNICAL_REQUIREMENT_GAPS.md
  - SPECIFICATIONS.md
  - spec/CHANGELOG.md
  - spec/updates/2026-11-23-concession-combo.md
  - spec/test-scope/current.json
  - apps/api/src/modules/booking/__tests__/booking-combos.spec.ts
  - apps/api/test/mail-templates.spec.ts
  - apps/api/test/outbox-job.e2e-spec.ts
  - packages/shared/src/schemas/checkin.ts
  - apps/api/src/modules/checkin/checkin.service.ts
  - apps/api/test/checkin.e2e-spec.ts
  - apps/web/src/components/booking/__tests__/confirm.test.tsx
  - apps/web/src/components/ticket/__tests__/ticket.test.tsx
  - apps/web/src/components/staff/__tests__/checkin-result.test.tsx
  - apps/web/src/app/staff/__tests__/staff-pages.test.tsx
filesNew:
  - supabase/tests/073_concession_combo.test.sql
  - .context/review-reports/feature-concession-combo-phase-final-spec-validation-round-1-review.md
  - apps/web/src/components/booking/concession-selector.tsx
  - apps/web/src/components/booking/__tests__/concession-selector.test.tsx
evidence:
  reportPath: .context/review-reports/feature-concession-combo-phase-final-spec-validation-round-1-review.md
  round: 1
  verdict: PASS (spec-validator final round 2)
next: "Feature concession-combo đã close-out (commit e610a67). Chưa push. Việc kế: GAP-037/038/039/040 qua change-request riêng khi user yêu cầu"
loopSignal: none
approvals: []
```

- 2026-11-23 ▶ START builder phase-3-task-03 (Web UI: ConcessionSelector, PriceBreakdown combo, chi tiết vé, soat-ve)

- 2026-11-23 /resume: session cũ bị cắt ngang. Đĩa đã có concession-selector.tsx + PriceBreakdown combos. Redo builder trên đĩa (không revert); còn thiếu: nhúng xac-nhan, ket-qua, ve/[bookingCode], staff checkin-result, test.
- 2026-11-23 ✅ DONE [agent: builder] phase-3-task-03: web test 752 PASS, api 697 PASS, shared 44 PASS, typecheck PASS. Ngoài scope web: checkin.schema/service (+combos), checkin e2e-spec. Residual: touch target 32px, chưa e2e thật, loadCombos nuốt lỗi.
- 2026-11-23 ▶ START [agent: reviewer] phase-3-task-03 round 1 STRICT (cancel sẽ rerun reviewer, dọn report dở)
- 2026-11-23 ✅ DONE [agent: reviewer] round 1 STRICT FAIL: M1 ảnh combo vỡ, M2 nút 32px<44px, M3 AI-readable gate (hàm dài, magic 20, comment sai checkin.service:117, thiếu API_SPEC). Minor m1-m9. Verify PASS (shared 44, api 697, web 752, typecheck, lint).
- 2026-11-23 ▶ START [agent: builder] fix round-1 (attempt 1)
- 2026-11-23 ✅ DONE [agent: builder] fix attempt 1: M1-M3 + m1,m2,m5,m7,m8,m9. pnpm test shared 44, api 698, web 757 PASS; typecheck, lint PASS. Residual: m3,m4,m6, ảnh seed thiếu asset, chưa e2e/visual.
- 2026-11-23 ▶ START [agent: reviewer] round 2 STRICT (cancel sẽ rerun, dọn report dở)
- 2026-11-23 ✅ DONE [agent: reviewer] round 2 STRICT PASS. Điều kiện đã thực hiện: GAP-037 (R-100) vào gap register; Residual vào task file.
- 2026-11-23 ▶ START [agent: spec-validator] phase-final feature/concession-combo (cancel sẽ rerun)
- 2026-11-23 ✅ DONE [agent: spec-validator] final round 1 FAIL: #1 test-scope thiếu R-58/69/100, #2 voucher applies_to (GAP-040), #3 admin CRUD combo (GAP-039), #4 thiếu test tính tiền, #5 per-cinema vs chuỗi (GAP-038), #6 wording R-69/R-100, #7 thiếu test mail. Đã ghi GAP-038..040.
- 2026-11-23 ▶ START [agent: builder] fix #4,#7 + [agent: spec-publisher] fix #1,#5,#6 song song (cancel sẽ redo bước này)
- 2026-11-23 ✅ DONE [agent: builder] #4,#7: pgTAP 073 (31/31 ok trong transaction rollback), test tính tiền API, test mail combo; pnpm test shared 44/api 705/web 757, typecheck, lint PASS. [agent: spec-publisher] R-58/69/72/100 wording + GAP refs + test-scope v37 (giữ 3.7.0/37).
- 2026-11-23 ▶ START [agent: spec-validator] final round 2 (cancel sẽ rerun)
- 2026-11-23 ✅ DONE [agent: spec-validator] final round 2 PASS. Close-out: ERD, progress.json, BACKLOG CR-018 done + archive, graphify update, commit e610a67 (staging, chưa push).
