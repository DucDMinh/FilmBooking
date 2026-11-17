import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Template mail Supabase Auth (GoTrue) nằm ngoài apps/api: kiểm tra tĩnh để không lệch thương hiệu/biến.
const templatesDir = fileURLToPath(new URL("../../../supabase/templates/", import.meta.url));

const ALLOWED_VARIABLES = new Set([".ConfirmationURL", ".Token", ".TokenHash", ".Email", ".NewEmail", ".SiteURL"]);

// Link xác nhận đăng ký trỏ thẳng web để server đổi token_hash lấy phiên (không dùng .ConfirmationURL, token sẽ nằm ở fragment).
const CONFIRM_LINK = "{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}";

const templates: Record<string, { required: string[]; mustMention?: string[] }> = {
  confirmation: { required: [".SiteURL", ".TokenHash"], mustMention: ["24 giờ"] },
  recovery: { required: [".ConfirmationURL"], mustMention: ["1 giờ"] },
  magic_link: { required: [".ConfirmationURL"] },
  email_change: { required: [".ConfirmationURL", ".Email", ".NewEmail"] },
  invite: { required: [".ConfirmationURL"] },
  reauthentication: { required: [".Token"] },
};

function load(name: string): string {
  return readFileSync(`${templatesDir}${name}.html`, "utf8");
}

describe("template mail Supabase Auth", () => {
  for (const [name, rule] of Object.entries(templates)) {
    describe(name, () => {
      const html = load(name);

      it("mang thương hiệu CINEMO, tiếng Việt, bố cục bảng", () => {
        expect(html).toContain("CINEMO");
        expect(html).toContain('lang="vi"');
        expect(html).toContain("#F06D5B");
        expect(html).toContain("<table");
        expect(html).not.toMatch(/display\s*:\s*flex/i);
      });

      it("chứa biến bắt buộc", () => {
        for (const variable of rule.required) {
          expect(html).toContain(`{{ ${variable} }}`);
        }
      });

      it("chỉ dùng biến Go template được phép", () => {
        const used = Array.from(html.matchAll(/\{\{\s*([^}\s]+)\s*\}\}/g), ([, variable]) => variable ?? "");
        expect(used.length).toBeGreaterThan(0);
        for (const variable of used) {
          expect(ALLOWED_VARIABLES.has(variable), `biến lạ: ${variable}`).toBe(true);
        }
      });

      it("không có script", () => {
        expect(html).not.toMatch(/<script/i);
      });

      it("nêu đúng hạn link theo spec", () => {
        for (const phrase of rule.mustMention ?? []) {
          expect(html).toContain(phrase);
        }
      });
    });
  }

  it("link dự phòng dạng text bên dưới nút CTA (mọi mail có link)", () => {
    const linkByTemplate: Record<string, string> = {
      confirmation: CONFIRM_LINK,
      recovery: "{{ .ConfirmationURL }}",
      magic_link: "{{ .ConfirmationURL }}",
      email_change: "{{ .ConfirmationURL }}",
      invite: "{{ .ConfirmationURL }}",
    };
    for (const [name, link] of Object.entries(linkByTemplate)) {
      const occurrences = load(name).split(link).length - 1;
      expect(occurrences, name).toBeGreaterThanOrEqual(3); // href nút + href text + text hiển thị
    }
  });

  it("confirmation: link đăng nhập luôn qua /auth/confirm, đúng type=signup, không còn .ConfirmationURL", () => {
    const html = load("confirmation");
    expect(html).toContain(CONFIRM_LINK);
    expect(html).toMatch(/token_hash=\{\{ \.TokenHash \}\}&amp;type=signup&amp;next=\//);
    expect(html).not.toContain(".ConfirmationURL");
  });

  it("4 template còn lại (recovery, magic_link, email_change, invite) vẫn dùng .ConfirmationURL, không đổi sang /auth/confirm", () => {
    for (const name of ["recovery", "magic_link", "email_change", "invite"]) {
      const html = load(name);
      expect(html, name).toContain("{{ .ConfirmationURL }}");
      expect(html, name).not.toContain("/auth/confirm");
    }
  });
});

describe("supabase/config.toml nối template Auth", () => {
  const configPath = fileURLToPath(new URL("../../../supabase/config.toml", import.meta.url));
  const config = readFileSync(configPath, "utf8");
  const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

  for (const name of Object.keys(templates)) {
    it(`khối [auth.email.template.${name}] có subject [CINEMO] và content_path trỏ tới file thật`, () => {
      const header = `[auth.email.template.${name}]`;
      const start = config.indexOf(`\n${header}`);
      expect(start, `thiếu khối ${name}`).toBeGreaterThanOrEqual(0);
      const rest = config.slice(start + header.length + 1);
      const next = rest.search(/\n\[/);
      const body = next === -1 ? rest : rest.slice(0, next);
      expect(body).toMatch(/^subject\s*=\s*"\[CINEMO\]/m);
      const path = /^content_path\s*=\s*"\.\/(supabase\/templates\/[^"]+)"/m.exec(body)?.[1];
      expect(path, `thiếu content_path ${name}`).toBe(`supabase/templates/${name}.html`);
      expect(existsSync(`${repoRoot}${path}`)).toBe(true);
    });
  }

  it("không bật [auth.email.notification.*] (mail đổi mật khẩu R-14 do Nest gửi, tránh trùng)", () => {
    expect(config).not.toMatch(/^\[auth\.email\.notification\./m);
  });
});

