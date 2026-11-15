import { initSentry } from "./common/monitoring/sentry";

// Phải được import đầu tiên trong main.ts để Sentry gắn hook trước khi Nest nạp module.
// Đọc process.env trực tiếp vì chạy trước DI/validate env; thiếu DSN -> tắt hẳn.
initSentry(process.env.SENTRY_DSN?.trim() || undefined);
