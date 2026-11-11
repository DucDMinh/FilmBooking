/** Chính sách mật khẩu (R-02) dùng chung web (thanh độ mạnh) và api (kiểm tra bắt buộc). */
export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt chỉ dùng 72 byte đầu, nên giới hạn theo BYTE UTF-8 chứ không theo số ký tự. */
export const PASSWORD_MAX_BYTES = 72;

export type PasswordIssue =
  | "TOO_SHORT"
  | "TOO_LONG"
  | "MISSING_UPPERCASE"
  | "MISSING_LOWERCASE"
  | "MISSING_DIGIT";

export const PASSWORD_ISSUE_MESSAGES: Record<PasswordIssue, string> = {
  TOO_SHORT: `Mật khẩu phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự`,
  TOO_LONG: `Mật khẩu không được dài quá ${PASSWORD_MAX_BYTES} ký tự`,
  MISSING_UPPERCASE: "Mật khẩu phải có chữ hoa",
  MISSING_LOWERCASE: "Mật khẩu phải có chữ thường",
  MISSING_DIGIT: "Mật khẩu phải có chữ số",
};

/** Trả danh sách vi phạm; rỗng = hợp lệ. */
export function checkPasswordPolicy(password: string): PasswordIssue[] {
  const issues: PasswordIssue[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) issues.push("TOO_SHORT");
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) issues.push("TOO_LONG");
  if (!/\p{Lu}/u.test(password)) issues.push("MISSING_UPPERCASE");
  if (!/\p{Ll}/u.test(password)) issues.push("MISSING_LOWERCASE");
  if (!/\d/.test(password)) issues.push("MISSING_DIGIT");
  return issues;
}

/** 0 (rỗng) .. 4 (mạnh) cho thanh độ mạnh; chỉ gợi ý UI, không thay cho checkPasswordPolicy. */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (!password) return 0;
  const rulesMet = 4 - checkPasswordPolicy(password).filter((issue) => issue !== "TOO_LONG").length;
  const longWithSymbol = password.length >= 12 && /[^\p{L}\d]/u.test(password) ? 1 : 0;
  return Math.min(4, Math.max(1, rulesMet - 1 + longWithSymbol)) as 1 | 2 | 3 | 4;
}
