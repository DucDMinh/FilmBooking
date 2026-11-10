# Google Cloud Run Deployment Template

> **Platform id:** `gcp-cloud-run` — trong `.agent/brainstorm.md` chọn `other` (chưa phải option hạng nhất).
> **Region khuyến nghị:** `asia-southeast1` (Singapore) — ping thấp từ VN.
> **Phù hợp:** web/app Next.js, Node.js, container (có `Dockerfile` **hoặc** buildpacks).
> **Ưu điểm:** scale-to-zero (idle = 0đ), HTTPS + URL `*.run.app` miễn phí, không quản server, rollback theo revision.

---

## 0. Cách chạy lệnh (đọc trước)

| Cách | Khi nào dùng | Ghi chú |
|------|--------------|---------|
| **Cloud Shell** (khuyến nghị) | Muốn thử nhanh, không cài gì | Terminal trong browser tại https://console.cloud.google.com → icon `>_`; đã có sẵn `gcloud` + `git` + `docker`. **Không cần đưa key cho ai.** |
| Máy local | Deploy thường xuyên | Cài Google Cloud SDK, `gcloud auth login` |
| CI/CD (GitHub Actions) | Tự động hoá | Dùng Workload Identity Federation — **không lưu key** (mục 6) |

> ⚠️ **Không** dán Service Account key vào chat/git. Nếu cần cấp quyền cho agent, tạo SA riêng + key JSON rồi đặt file trên máy, xoá sau khi dùng.

---

## 1. Chuẩn bị (làm 1 lần)

### 1.1 Tạo project + billing
1. https://console.cloud.google.com → **New Project** → tên (vd `nta-web`) → ghi lại **Project ID** (khác tên hiển thị).
2. **Billing → Link a billing account**. Bắt buộc, kể cả khi vẫn nằm trong free tier.
3. Đặt **budget alert** để chặn bùng chi phí: https://console.cloud.google.com/billing/budgets (vd cảnh báo ở 50k / 200k / 1tr VND).

### 1.2 Đăng nhập + chọn project
```bash
gcloud auth login
gcloud config set project <PROJECT_ID>
gcloud config set run/region asia-southeast1
```

### 1.3 Bật API cần thiết
```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com
```

---

## 2. App cần chuẩn bị (Next.js)

### 2.1 `next.config.js` — bật standalone
```js
/** @type {import('next').NextConfig} */
module.exports = {
  output: 'standalone',   // build ra server tối giản → image nhỏ, start nhanh
};
```
Với App Router + ESM, tên file có thể là `next.config.mjs`.

### 2.2 Lắng nghe `PORT` do Cloud Run cấp
- Cloud Run inject biến `PORT` (mặc định `8080`). Next.js `standalone` đọc sẵn → **không cần sửa gì**.
- Nếu có custom server: `const port = process.env.PORT || 8080;`

### 2.3 `Dockerfile` (multi-stage, Next.js standalone)
```dockerfile
# syntax=docker/dockerfile:1

# ── deps ──
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── build ──
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── runner ──
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 8080
CMD ["node", "server.js"]
```
> Đổi `npm ci` → `pnpm install --frozen-lockfile` / `yarn --immutable` / `bun install` theo `package_manager` trong `.context/project-config.md`.
> **Không có Dockerfile?** Cloud Run vẫn build được bằng buildpacks (mục 3.1) miễn là `build_command` khai đúng.

### 2.4 `.gcloudignore` — đừng upload rác
```
node_modules
.next
.git
.env
.env.*
!.env.example
*.log
```

### 2.5 `package.json` — scripts
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint"
}
```
Ghi vào `.context/project-config.md`:
```yaml
package_manager: npm
build_command: npm run build
install_command: npm ci
web_lint_command: npm run lint
```

---

## 3. Deploy

### 3.1 Deploy từ source (khuyến nghị cho lần đầu — không cần build Docker local)
```bash
gcloud run deploy nta-web \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 3
```
- `--source .` → tự đẩy code lên **Cloud Build**, build image, push vào **Artifact Registry**, deploy. (Lần đầu Cloud Build tạo repo `cloud-run-source-deploy`.)
- Có `Dockerfile` → dùng Dockerfile; không có → buildpacks.
- Kết thúc in ra URL: `https://nta-web-<hash>-as.a.run.app`

Sửa code rồi deploy lại = chạy đúng câu lệnh trên (Cloud Run tạo revision mới).

### 3.2 Deploy bằng image (khi cần CI/CD hoặc build tách)
```bash
# 1) Tạo Artifact Registry repo (1 lần)
gcloud artifacts repositories create nta-web \
  --repository-format=docker --location=asia-southeast1

# 2) Cho docker login
gcloud auth configure-docker asia-southeast1-docker.pkg.dev

# 3) Build + push
IMAGE=asia-southeast1-docker.pkg.dev/<PROJECT_ID>/nta-web/app:$(git rev-parse --short HEAD)
docker build -t "$IMAGE" .
docker push "$IMAGE"

# 4) Deploy
gcloud run deploy nta-web --image "$IMAGE" \
  --region asia-southeast1 --allow-unauthenticated \
  --port 8080 --min-instances 0 --max-instances 3
```
> Dọn image cũ để tránh phí lưu trữ: đặt **cleanup policy** cho Artifact Registry (giữ 5–10 bản gần nhất).

---

## 4. Biến môi trường & secrets

```bash
# Env thường (public)
gcloud run services update nta-web --region asia-southeast1 \
  --set-env-vars NEXT_PUBLIC_API_URL=https://api.example.com,NODE_ENV=production

# Secret (token/key) — dùng Secret Manager, KHÔNG set thẳng env
printf '%s' 'super-secret-value' | gcloud secrets create JWT_SECRET --data-file=-
gcloud run services update nta-web --region asia-southeast1 \
  --set-secrets JWT_SECRET=JWT_SECRET:latest

# Cấp quyền cho service account của Cloud Run đọc secret
gcloud secrets add-iam-policy-binding JWT_SECRET \
  --member="serviceAccount:<PROJECT_NUMBER>-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```
> `.env.local` giữ gitignored (đúng chuẩn template). Secret production chỉ nằm ở Secret Manager / GitHub Secrets.

---

## 5. Domain riêng + HTTPS

```bash
gcloud run domain-mappings create \
  --service nta-web \
  --domain www.nta.vn \
  --region asia-southeast1
```
- Lệnh in ra bản ghi DNS dạng `CNAME` (hoặc `A`/`AAAA` cho apex) → thêm vào DNS provider → chờ verify → Google tự cấp SSL (Let's Encrypt-managed).
- Apex (`nta.vn`) + nhiều subdomain/domain: dùng **Global External Application Load Balancer** + **Google-managed certificate** (serverless NEG trỏ về Cloud Run).

---

## 6. CI/CD — GitHub Actions (keyless, không lưu key)

### 6.1 Tạo Workload Identity Federation (1 lần)
```bash
PROJECT_ID=<PROJECT_ID>
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
REPO=ocanhdt12-gif/nta-web

gcloud iam workload-identity-pools create github --location=global --project="$PROJECT_ID"

gcloud iam workload-identity-pools providers create-oidc github \
  --location=global --workload-identity-pool=github --project="$PROJECT_ID" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# SA cho CI
gcloud iam service-accounts create gh-deployer --project="$PROJECT_ID"

# Cho phép repo GitHub impersonate SA
gcloud iam service-accounts add-iam-policy-binding \
  "gh-deployer@$PROJECT_ID.iam.gserviceaccount.com" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"

# Quyền deploy
for R in roles/run.admin roles/artifactregistry.writer roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:gh-deployer@$PROJECT_ID.iam.gserviceaccount.com" --role="$R"
done
```

### 6.2 `.github/workflows/deploy.yml`
```yaml
name: Deploy to Cloud Run
on:
  push:
    branches: [main]

env:
  PROJECT_ID: ${{ vars.GCP_PROJECT_ID }}
  REGION: asia-southeast1
  SERVICE: nta-web
  IMAGE: asia-southeast1-docker.pkg.dev/${{ vars.GCP_PROJECT_ID }}/nta-web/app

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write        # cần cho OIDC
    steps:
      - uses: actions/checkout@v4

      - id: auth
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ vars.GCP_WIF_PROVIDER }}
          service_account: gh-deployer@${{ vars.GCP_PROJECT_ID }}.iam.gserviceaccount.com

      - uses: google-github-actions/setup-gcloud@v2

      - run: gcloud auth configure-docker asia-southeast1-docker.pkg.dev --quiet

      - run: |
          docker build -t "$IMAGE:${{ github.sha }}" .
          docker push "$IMAGE:${{ github.sha }}"

      - run: |
          gcloud run deploy "$SERVICE" \
            --image "$IMAGE:${{ github.sha }}" \
            --region "$REGION" \
            --allow-unauthenticated \
            --port 8080 \
            --min-instances 0 \
            --max-instances 3
```
GitHub repo **Variables** cần: `GCP_PROJECT_ID`, `GCP_WIF_PROVIDER` (in ra từ lệnh `... providers describe`).

> Branch: template mặc định `staging-direct` (push `target_branch`). Nếu CI chạy trên `main`, đổi `branches` cho khớp hoặc giữ staging/prod 2 service riêng.

---

## 7. Vận hành, health check, rollback

```bash
# Xem service + URL
gcloud run services describe nta-web --region asia-southeast1 --format='value(status.url)'

# Log (debug khi lỗi)
gcloud run services logs read nta-web --region asia-southeast1 --limit 100

# Danh sách revision
gcloud run revisions list --service nta-web --region asia-southeast1

# Rollback 100% traffic về revision trước
gcloud run services update-traffic nta-web \
  --to-revisions <REVISION_NAME>=100 --region asia-southeast1

# Canary 10% revision mới
gcloud run services update-traffic nta-web \
  --to-revisions <NEW_REV>=10,<OLD_REV>=90 --region asia-southeast1
```
- Health check chuẩn của template: `GET /api/health` → `{ "status": "ok", ... }`. Cloud Run có thể dùng làm startup/liveness probe (`--startup-probe` / `--liveness-probe`).
- Ghi mỗi lần deploy vào `.devops/deploy-log.md` theo format có sẵn.

---

## 8. Chi phí & free tier

| Hạng mục | Free tier / tháng |
|----------|-------------------|
| Requests | 2,000,000 |
| CPU | 180,000 vCPU-giây |
| RAM | 360,000 GiB-giây |
| Egress mạng | 1 GiB (Bắc Mỹ) |
| Cloud Build | 120 phút build/ngày (miễn phí) |

- `--min-instances 0` → **idle = 0đ**, đổi lại cold start ~1–3s (web marketing chấp nhận được).
- Giữ `--max-instances` thấp (2–3) để chặn bùng chi phí khi bị spam.
- `asia-southeast1` (Singapore) là tier giá thấp; đừng để mặc định `us-central1` nếu người dùng ở VN.

---

## 9. Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp | Cách xử |
|-------------|------------------------|---------|
| `503` / "container failed to start" | Sai `PORT`, Dockerfile không `EXPOSE`, app crash lúc boot | `--port 8080`, xem `logs read` |
| `PERMISSION_DENIED` khi deploy | Thiếu role | Thêm `roles/run.admin` + `roles/iam.serviceAccountUser` |
| Build fail "no buildpack / no Dockerfile" | Thiếu Dockerfile và chưa khai `build_command` | Thêm `Dockerfile` (mục 2.3) |
| Domain "not verified" | Thiếu/sai bản ghi DNS | Thêm đúng CNAME/A như lệnh in ra; chờ 5–30 phút |
| Ảnh/static 404 | Thiếu `COPY .next/static` | Kiểm tra Dockerfile runner stage |
| Lỗi CORS gọi API | Thiếu origin | Cấu hình CORS ở API hoặc `NEXT_PUBLIC_API_URL` |
| Build chậm / image nặng | Upload cả `node_modules` | Thêm `.gcloudignore` (mục 2.4) |
| Phí tăng bất thường | `min-instances` > 0 hoặc `max-instances` cao | Set `min=0`, `max=3`, bật budget alert |

---

## 10. Ghi vào `project-config` của template

```yaml
# .context/project-config.md
deploy_platform: other        # thực tế = gcp-cloud-run
ci_cd: github-actions

build_command: npm run build
install_command: npm ci
```

`.devops/environments.md` giữ nguyên khung; đặt tên service theo môi trường:
- staging → service `nta-web-staging`
- production → service `nta-web` (auto-deploy `main` sau khi approval)

---

## 11. Checklist lần deploy đầu

- [ ] Project GCP đã tạo + link billing + budget alert
- [ ] `gcloud` đã `auth login` + `set project` + `set run/region asia-southeast1`
- [ ] 4 API đã enable (run, cloudbuild, artifactregistry, secretmanager)
- [ ] `next.config.js` có `output: 'standalone'`
- [ ] Có `Dockerfile` + `.gcloudignore`
- [ ] `build_command` khai đúng trong `project-config.md`
- [ ] Deploy `--source .` chạy thành công, URL `.run.app` mở được
- [ ] `/api/health` trả `{ "status": "ok" }`
- [ ] Env/secrets set qua `--set-env-vars` / Secret Manager (không nhúng vào image)
- [ ] (Tuỳ chọn) Domain riêng map xong + SSL active
- [ ] (Tuỳ chọn) GitHub Actions deploy keyless chạy được
- [ ] Ghi entry vào `.devops/deploy-log.md`
