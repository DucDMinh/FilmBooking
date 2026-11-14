import { createHash } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type { SupabaseClient } from "@supabase/supabase-js";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { renderTemplate } from "../../src/modules/mail/templates";
import { bootTestApp, countLocalInbox, drainOutbox, runLocalSql } from "./helpers/app-harness";
import { createFactories, mintToken, type TestUser } from "./helpers/factories";
import { cleanupScope, createAdminClient, createRunScope, loadLocalSupabaseEnv } from "./helpers/supabase-test";

const supabaseEnv = await loadLocalSupabaseEnv();

const STRONG_PASSWORD = "It-Passw0rd!2026";
const WRONG_PASSWORD = "Sai-Mat-Khau-9";
const emailKey = (email: string): string => createHash("sha256").update(email).digest("hex").slice(0, 32);

// Docker/Supabase không chạy -> skip (đã cảnh báo ở loadLocalSupabaseEnv), không fail.
describe.skipIf(!supabaseEnv)("integration: luồng auth (AC-01..AC-05)", () => {
  const env = supabaseEnv!;
  const scope = createRunScope();
  let admin: SupabaseClient;
  let app: INestApplication;
  let factories: ReturnType<typeof createFactories>;
  let server: ReturnType<INestApplication["getHttpServer"]>;
  let ipSeq = 0;

  /** Mỗi request công khai mang IP giả riêng (TRUST_PROXY_HOPS=1) để không chạm bucket rate limit theo IP dùng chung. */
  const nextIp = (): string => `10.${Number.parseInt(scope.runId.slice(0, 2), 16)}.${Number.parseInt(scope.runId.slice(2, 4), 16)}.${(ipSeq++ % 250) + 1}`;
  const post = (path: string) => request(server).post(path).set("X-Forwarded-For", nextIp());

  async function userIdByEmail(email: string): Promise<string> {
    const { data, error } = await admin.from("profiles").select("id").eq("email", email).single();
    if (error) throw new Error(`không tìm thấy profile ${email}: ${error.message}`);
    scope.userIds.add(data.id as string);
    return data.id as string;
  }

  async function outboxFor(email: string, kind: string) {
    const { data, error } = await admin.from("email_outbox").select("id, kind, status, payload").eq("to_email", email).ilike("kind", kind);
    if (error) throw error;
    return data ?? [];
  }

  beforeAll(async () => {
    admin = createAdminClient(env);
    factories = createFactories(env, admin, scope);
    ({ app } = await bootTestApp(env));
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
    if (!admin) return;
    await admin.from("email_outbox").delete().like("to_email", `${scope.prefix}%`);
    await admin.from("login_attempts").delete().like("email", `${scope.prefix}%`);
    await admin.from("oauth_missing_email_requests").delete().like("email", `${scope.prefix}%`);
    await cleanupScope(admin, scope);
  });

  describe("AC-01 + AC-02: xác nhận email, giữ ghế, gửi lại xác nhận", () => {
    const email = `${scope.prefix}newbie@example.com`;
    let userId: string;
    let showtimeId: string;
    let seatIds: string[];

    beforeAll(async () => {
      const showtime = await factories.createShowtime();
      showtimeId = showtime.id;
      seatIds = showtime.seatIds;
      const { error } = await admin
        .from("price_rules")
        .insert({ scope: "SHOWTIME", showtime_id: showtime.id, seat_type: "NORMAL", amount: 90_000 });
      if (error) throw new Error(`tạo giá suất thất bại: ${error.message}`);
    });

    it("đăng ký qua API -> phản hồi trung tính, user chưa xác nhận email", async () => {
      const res = await post("/auth/register").send({ email, password: STRONG_PASSWORD, acceptTerms: true, captchaToken: "it-captcha" });
      expect(res.status, JSON.stringify(res.body)).toBe(202);
      expect(res.body).toEqual({ status: "CHECK_EMAIL" });
      userId = await userIdByEmail(email);
      const { data } = await admin.auth.admin.getUserById(userId);
      expect(data.user?.email_confirmed_at ?? null).toBeNull();
    });

    it("AC-01: chưa xác nhận email -> bị chặn giữ ghế (EMAIL_NOT_CONFIRMED), không có ghế/đơn nào bị tạo", async () => {
      const token = await mintToken(env, { id: userId, email });
      const me = await request(server).get("/me").set("Authorization", `Bearer ${token}`);
      expect(me.body).toMatchObject({ emailConfirmed: false });

      const hold = await request(server).post("/bookings/holds").set("Authorization", `Bearer ${token}`).send({ showtimeId, seatIds: [seatIds[0]] });
      expect(hold.status).toBe(403);
      expect(hold.body.error.code).toBe("EMAIL_NOT_CONFIRMED");
      const orders = await admin.from("orders").select("id").eq("user_id", userId);
      expect(orders.data ?? []).toHaveLength(0);
      const held = await admin.from("showtime_seat_states").select("id").eq("showtime_id", showtimeId);
      expect(held.data ?? []).toHaveLength(0);
    });

    it("AC-01: chưa xác nhận email -> đăng nhập qua API cũng bị từ chối với hướng dẫn xác nhận", async () => {
      const res = await post("/auth/login").send({ email, password: STRONG_PASSWORD });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("EMAIL_NOT_CONFIRMED");
      expect(res.body.accessToken).toBeUndefined();
    });

    it("AC-02: gửi lại xác nhận lần 1 OK; bấm lại trong 60 giây -> 429 kèm retryAfter, không gửi thêm email", async () => {
      const first = await post("/auth/resend-confirmation").send({ email });
      expect(first.status, JSON.stringify(first.body)).toBe(202);
      expect(first.body).toEqual({ status: "CHECK_EMAIL" });

      // Đợi mail lượt 1 về hộp thư local rồi mới chụp mốc đếm.
      let inboxAfterFirst = await countLocalInbox(email);
      for (let attempt = 0; inboxAfterFirst !== null && inboxAfterFirst < 2 && attempt < 10; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        inboxAfterFirst = await countLocalInbox(email);
      }

      const second = await post("/auth/resend-confirmation").send({ email });
      expect(second.status).toBe(429);
      expect(second.body.error.code).toBe("RATE_LIMITED");
      expect(second.body.error.details.retryAfter).toBeGreaterThan(0);
      expect(second.body.error.details.retryAfter).toBeLessThanOrEqual(60);

      if (inboxAfterFirst === null) {
        console.warn("[auth-flows] Mailpit (54324) không truy cập được -> bỏ qua assertion đếm mail của AC-02.");
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      expect(await countLocalInbox(email)).toBe(inboxAfterFirst);
    });

    it("AC-02: hết 60 giây (xoá bucket cooldown) -> gửi lại được", async () => {
      const key = `resend:cooldown:${emailKey(email)}`;
      const del = await admin.from("rate_limit_buckets").delete().eq("key", key);
      expect(del.error).toBeNull();
      const res = await post("/auth/resend-confirmation").send({ email });
      expect(res.status, JSON.stringify(res.body)).toBe(202);
      await admin.from("rate_limit_buckets").delete().in("key", [key, `resend:hour:${emailKey(email)}`]);
    });

    it("AC-01: sau khi xác nhận email thì giữ ghế được", async () => {
      const confirmed = await admin.auth.admin.updateUserById(userId, { email_confirm: true });
      expect(confirmed.error).toBeNull();
      const token = await mintToken(env, { id: userId, email });
      const hold = await request(server).post("/bookings/holds").set("Authorization", `Bearer ${token}`).send({ showtimeId, seatIds: [seatIds[0]] });
      expect(hold.status, JSON.stringify(hold.body)).toBe(201);
      expect(hold.body).toMatchObject({ seatCount: 1, totalAmount: 90_000 });
    });
  });

  describe("AC-03: khoá đăng nhập sau 5 lần sai", () => {
    let user: TestUser;

    beforeAll(async () => {
      user = await factories.createUser("lock");
    });

    it("5 lần sai liên tiếp -> khoá; lần 6 nhập đúng vẫn bị từ chối (423) + đúng 1 email cảnh báo cho chủ tài khoản", async () => {
      const attempt = (password: string) =>
        post("/auth/login").send({ email: user.email, password, captchaToken: "it-captcha" });

      for (let index = 1; index <= 4; index += 1) {
        const res = await attempt(WRONG_PASSWORD);
        expect(res.status, `lần sai ${index}: ${JSON.stringify(res.body)}`).toBe(401);
      }
      expect(await outboxFor(user.email, "ACCOUNT_LOCKED_ALERT")).toHaveLength(0);

      const fifth = await attempt(WRONG_PASSWORD);
      expect(fifth.status, JSON.stringify(fifth.body)).toBe(423);
      expect(fifth.body.error.code).toBe("ACCOUNT_LOCKED");

      const sixth = await attempt(user.password);
      expect(sixth.status).toBe(423);
      expect(sixth.body.error.code).toBe("ACCOUNT_LOCKED");
      expect(sixth.body.accessToken).toBeUndefined();

      const alerts = await outboxFor(user.email, "ACCOUNT_LOCKED_ALERT");
      expect(alerts).toHaveLength(1); // lần 6 không bắn thêm cảnh báo
      await drainOutbox(app, admin, alerts.map((row) => row.id as string));
      expect((await outboxFor(user.email, "ACCOUNT_LOCKED_ALERT"))[0]!.status).toBe("SENT");
      const rendered = renderTemplate("ACCOUNT_LOCKED_ALERT", alerts[0]!.payload as Record<string, unknown>);
      expect(rendered.subject.length).toBeGreaterThan(0);
    });

    it("hết thời gian khoá -> đăng nhập đúng được và xoá bộ đếm lỗi", async () => {
      const unlock = await admin.from("login_attempts").update({ locked_until: new Date(Date.now() - 60_000).toISOString() }).eq("email", user.email);
      expect(unlock.error).toBeNull();
      const ok = await post("/auth/login").send({ email: user.email, password: user.password });
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      expect(ok.body.accessToken).toBeTruthy();
      expect(ok.body.user.email).toBe(user.email);
      const row = await admin.from("login_attempts").select("failed_count").eq("email", user.email).maybeSingle();
      expect(row.data?.failed_count ?? 0).toBe(0);
    });
  });

  describe("AC-04: OAuth trùng email không tự gộp (guard DB mô phỏng callback GoTrue)", () => {
    let owner: TestUser;
    let ownerId: string;

    beforeAll(async () => {
      owner = await factories.createUser("pwowner"); // có mật khẩu + identity email
      ownerId = owner.id;
    });

    const insertIdentity = (userId: string, provider: string, providerId: string, email: string | null = null): string =>
      runLocalSql(
        `insert into auth.identities (id, provider, provider_id, user_id, identity_data, created_at, updated_at) values ` +
          `(gen_random_uuid(), '${provider}', '${providerId}', '${userId}', ` +
          `'${JSON.stringify(email ? { sub: providerId, email } : { sub: providerId })}'::jsonb, now(), now())`,
      );

    it("Google cùng email lần đầu (không có link-intent) -> bị chặn, không tạo user mới, không tự liên kết", async () => {
      const providerId = `g_${scope.runId}_auto`;
      expect(() => insertIdentity(ownerId, "google", providerId, owner.email)).toThrow(/OAUTH_AUTO_MERGE_BLOCKED/);

      const users = await admin.from("profiles").select("id").eq("email", owner.email);
      expect(users.data ?? []).toHaveLength(1);
      const token = owner.accessToken!;
      const identities = await request(server).get("/me/identities").set("Authorization", `Bearer ${token}`);
      expect(identities.status, JSON.stringify(identities.body)).toBe(200);
      expect(identities.body.identities.map((item: { provider: string }) => item.provider)).toEqual(["email"]);
    });

    it("tài khoản OAuth mới (user khác) có email trùng tài khoản mật khẩu -> bị chặn, yêu cầu đăng nhập mật khẩu", async () => {
      const stranger = await factories.createUser("stranger");
      runLocalSql(`delete from auth.identities where user_id = '${stranger.id}'`);
      runLocalSql(`update auth.users set encrypted_password = '' where id = '${stranger.id}'`);
      expect(() => insertIdentity(stranger.id, "google", `g_${scope.runId}_dup`, owner.email)).toThrow(/OAUTH_EMAIL_COLLISION_LOGIN_REQUIRED/);
    });

    it("đã đăng nhập mật khẩu (recent login) -> tạo link-intent rồi liên kết Google được; email thông báo vào outbox", async () => {
      const providerId = `g_${scope.runId}_linked`;
      const intent = await request(server)
        .post("/me/identities/link-intent")
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ provider: "google" });
      expect(intent.status, JSON.stringify(intent.body)).toBe(204);

      insertIdentity(ownerId, "google", providerId, owner.email); // GoTrue liên kết sau khi có intent hợp lệ
      const identities = await request(server).get("/me/identities").set("Authorization", `Bearer ${owner.accessToken}`);
      expect(identities.body.identities.map((item: { provider: string }) => item.provider).sort()).toEqual(["email", "google"]);

      const linked = await outboxFor(owner.email, "identity_linked");
      expect(linked).toHaveLength(1);

      // Intent đã bị tiêu thụ đúng 1 lần, và chèn thêm identity google (không tạo intent mới) bị chặn.
      const intents = await admin.from("identity_link_intents").select("consumed_at").eq("user_id", ownerId).eq("provider", "google");
      expect(intents.data ?? []).toHaveLength(1);
      expect(intents.data![0]!.consumed_at).not.toBeNull();
      expect(() => insertIdentity(ownerId, "google", `g_${scope.runId}_again`, null)).toThrow(/OAUTH_AUTO_MERGE_BLOCKED/);
      expect(() => insertIdentity(ownerId, "facebook", `fb_${scope.runId}_x`, null)).toThrow(/OAUTH_AUTO_MERGE_BLOCKED/);
    });

    it("tài khoản mạng xã hội đã gắn user khác không gắn được vào user thứ hai (R-23)", async () => {
      const second = await factories.createUser("second");
      const intent = await request(server).post("/me/identities/link-intent").set("Authorization", `Bearer ${second.accessToken}`).send({ provider: "google" });
      expect(intent.status).toBe(204);
      expect(() => insertIdentity(second.id, "google", `g_${scope.runId}_linked`, null)).toThrow(/OAUTH_IDENTITY_ALREADY_LINKED/);
    });

    it("Facebook không trả email: email nhập trùng tài khoản có sẵn -> phản hồi giống hệt email lạ, không tạo user", async () => {
      const fresh = `${scope.prefix}fbfresh@example.com`;
      const known = await post("/auth/oauth/missing-email").send({ provider: "facebook", email: owner.email });
      const unknown = await post("/auth/oauth/missing-email").send({ provider: "facebook", email: fresh });
      expect(known.status).toBe(200);
      expect(unknown.status).toBe(200);
      expect(known.body).toEqual(unknown.body);
      expect(known.body.status).toBe("CHECK_EMAIL");
      expect((await admin.from("profiles").select("id").eq("email", owner.email)).data ?? []).toHaveLength(1);
      expect((await admin.from("profiles").select("id").eq("email", fresh)).data ?? []).toHaveLength(0);
      expect(await outboxFor(owner.email, "oauth_missing_email_collision")).toHaveLength(1);
    });
  });

  describe("AC-05: không huỷ liên kết phương thức đăng nhập cuối", () => {
    it("tài khoản chỉ còn Facebook -> DELETE bị 409 + hướng dẫn; thêm mật khẩu rồi mới huỷ được", async () => {
      const email = `${scope.prefix}fbonly@example.com`;
      const created = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { created_via: "nest" } });
      if (created.error || !created.data.user) throw new Error(`createUser fbonly thất bại: ${created.error?.message}`);
      const userId = created.data.user.id;
      scope.userIds.add(userId);
      runLocalSql(`delete from auth.identities where user_id = '${userId}'`);
      // Mô phỏng user OAuth-only: không có mật khẩu (guard coi encrypted_password khác rỗng là "đã có mật khẩu").
      runLocalSql(`update auth.users set encrypted_password = '' where id = '${userId}'`);
      runLocalSql(
        `insert into auth.identities (id, provider, provider_id, user_id, identity_data, created_at, updated_at) values ` +
          `(gen_random_uuid(), 'facebook', 'fb_${scope.runId}_only', '${userId}', '{"sub":"fb_${scope.runId}_only"}'::jsonb, now(), now())`,
      );
      const auth = { Authorization: `Bearer ${await mintToken(env, { id: userId, email })}` };

      const before = await request(server).get("/me/identities").set(auth);
      expect(before.status, JSON.stringify(before.body)).toBe(200);
      expect(before.body).toMatchObject({ hasPassword: false, canUnlink: false, totalMethods: 1 });

      const refused = await request(server).delete("/me/identities/facebook").set(auth);
      expect(refused.status, JSON.stringify(refused.body)).toBe(409);
      expect(refused.body.error.details.code).toBe("LAST_LOGIN_METHOD");
      expect(refused.body.error.message).toMatch(/mật khẩu|phương thức/i); // hướng dẫn thêm phương thức khác
      const still = await request(server).get("/me/identities").set(auth);
      expect(still.body.identities.map((item: { provider: string }) => item.provider)).toEqual(["facebook"]);

      const weak = await request(server).post("/me/password").set(auth).send({ password: "abc" });
      expect(weak.status).toBe(400);
      const added = await request(server).post("/me/password").set(auth).send({ password: STRONG_PASSWORD });
      expect(added.status, JSON.stringify(added.body)).toBe(200);

      const unlinked = await request(server).delete("/me/identities/facebook").set(auth);
      expect(unlinked.status, JSON.stringify(unlinked.body)).toBe(200);
      expect(unlinked.body).toMatchObject({ success: true, unlinkedProvider: "facebook" });
      const after = await request(server).get("/me/identities").set(auth);
      expect(after.body.identities.map((item: { provider: string }) => item.provider)).toEqual(["email"]);
      expect(after.body.hasPassword).toBe(true);
    });

    it("không huỷ được phương thức email/mật khẩu qua API", async () => {
      const user = await factories.createUser("pwonly");
      const res = await request(server).delete("/me/identities/email").set("Authorization", `Bearer ${user.accessToken}`);
      expect(res.status).toBe(400); // `email` không thuộc enum provider huỷ được
    });
  });
});
