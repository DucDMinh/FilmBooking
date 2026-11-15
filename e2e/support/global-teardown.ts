import { adminClient, cleanupE2eData } from "./data";

/** Dọn dữ liệu e2e (theo tiền tố) sau cả lượt chạy; bản ghi sót của lượt hỏng trước đó cũng bị dọn. */
export default async function globalTeardown(): Promise<void> {
  await cleanupE2eData(adminClient());
}
