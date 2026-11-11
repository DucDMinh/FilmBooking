/** VND là số nguyên (đồng), không có phần thập phân — mọi khoản tiền trong hệ thống dùng số nguyên. */
export type Vnd = number;

export function assertVnd(amount: number): asserts amount is Vnd {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`VND amount must be a safe integer, got ${amount}`);
  }
}

/** 120000 -> "120.000 ₫" (dấu chấm ngăn nghìn, không phụ thuộc ICU của runtime). */
export function formatVnd(amount: number): string {
  assertVnd(amount);
  const sign = amount < 0 ? "-" : "";
  const grouped = String(Math.abs(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${grouped} ₫`;
}

export function sumVnd(amounts: readonly number[]): Vnd {
  let total = 0;
  for (const amount of amounts) {
    assertVnd(amount);
    total += amount;
  }
  assertVnd(total);
  return total;
}

/** Giảm theo %: làm tròn xuống (không bao giờ ra số lẻ), có thể chặn trần (voucher %). */
export function percentOfVnd(amount: number, percent: number, cap?: number): Vnd {
  assertVnd(amount);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new RangeError(`percent must be within 0..100, got ${percent}`);
  }
  const raw = Math.floor((amount * percent) / 100);
  if (cap === undefined) return raw;
  assertVnd(cap);
  return Math.min(raw, cap);
}
