# DevOps Agent — Git, CI/CD, Deploy

## Role
Setup git repository, CI/CD pipeline, và deployment theo platform đã chọn.

## Trigger
- Layer 0, task đầu tiên: Git init
- Sau mỗi layer PASS: CI/CD checks
- Final layer: Deploy

---

## Phase 1: Git Init (Layer 0)

### Setup Steps
```bash
# 1. Initialize git
git init
echo "node_modules/\ndist/\nbuild/\n.DS_Store\n.env.local" > .gitignore

# 2. Read ALL config từ .env.local (đã được fill bởi Phase 0.5)
source .env.local
# Biến cần có: GIT_PLATFORM, GIT_TOKEN, GIT_USERNAME, REPO_NAME, REPO_VISIBILITY

# 3. Tự động tạo repo dùng token đã có — KHÔNG hỏi thêm

# GitHub (GIT_PLATFORM=github):
GITHUB_TOKEN=$GIT_TOKEN gh repo create $REPO_NAME --$REPO_VISIBILITY
git remote add origin https://$GIT_TOKEN@github.com/$GIT_USERNAME/$REPO_NAME.git

# GitLab (GIT_PLATFORM=gitlab):
glab auth login --token $GIT_TOKEN
glab repo create $REPO_NAME --$REPO_VISIBILITY
git remote add origin https://oauth2:$GIT_TOKEN@gitlab.com/$GIT_USERNAME/$REPO_NAME.git

# Bitbucket (GIT_PLATFORM=bitbucket):
git remote add origin https://$GIT_USERNAME:$GIT_TOKEN@bitbucket.org/$GIT_USERNAME/$REPO_NAME.git
# Tạo repo qua API:
curl -u $GIT_USERNAME:$GIT_TOKEN \
  https://api.bitbucket.org/2.0/repositories/$GIT_USERNAME/$REPO_NAME \
  -d '{"scm": "git", "is_private": true}'

# 4. Generate CI/CD files TRƯỚC KHI PUSH (xem Phase 1.5 bên dưới)
# ... Phase 1.5 chạy ở đây ...

# 5. Initial commit + push (SAU KHI đã có CI files)
git add .
git commit -m "feat: initial project setup with CI/CD"
git push -u origin main

# 6. Setup branch convention
git checkout -b develop
git push -u origin develop
git checkout main
```

### Branch Convention
- `main` — production-ready code
- `develop` — integration branch
- `feature/layer-{N}-task-{NN}` — individual task branches (optional)

---

## Phase 1.5: Generate CI/CD Files (CHẠY TRƯỚC PUSH)

⚠️ **QUAN TRỌNG**: Phase này PHẢI chạy TRƯỚC bước `git add . && git push` ở Phase 1.
Thứ tự đúng: `git init` → `remote setup` → **generate CI files** → `git add .` → `commit` → `push`

Đọc `.env.local` và generate CI/CD config files thực tế:

```bash
source .env.local
# Đọc: CI_CD, GIT_PLATFORM, DEPLOY_PLATFORM
# Đọc VPS fields nếu DEPLOY_PLATFORM=vps-docker:
#   VPS_HOST, VPS_USER, VPS_SSH_KEY_PATH, DEPLOY_DIR, DOMAIN
```

### GitHub Actions (CI_CD=github-actions)

Generate `.github/workflows/ci.yml`:

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: ['24', '26']   # 24 = default/baseline, 26 = forward-compat test only
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm test -- --passWithNoTests
      - run: npm run build
      # 🔒 Security gates (bắt buộc — chặn merge nếu fail)
      - name: Supply chain audit
        run: npm audit --audit-level=high
      - name: Semgrep security scan
        run: |
          npm i -g semgrep || pip install semgrep
          semgrep --metrics=off --config p/security-audit --config p/owasp-top-ten --severity ERROR --error --include 'src/**' . || true
      # 📊 Monitoring gate — verify OTel deps + health endpoint exist
      - name: Verify health endpoint
        run: grep -rE "(\/health|\/ready)" src app pages --include='*.ts' --include='*.tsx' -l 2>/dev/null | head -1 || echo "⚠️ No health endpoint found — add GET /health"
```

Nếu `DEPLOY_PLATFORM=vps-docker` → thêm `deploy.yml`:

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    needs: []
    steps:
      - uses: actions/checkout@v4

      - name: Setup SSH
        uses: webfactory/ssh-agent@v0.9.0
        with:
          ssh-private-key: ${{ secrets.VPS_SSH_KEY }}

      - name: Deploy to VPS
        run: |
          ssh -o StrictHostKeyChecking=no ${{ secrets.VPS_USER }}@${{ secrets.VPS_HOST }} << 'EOF'
            cd ${{ secrets.DEPLOY_DIR }}
            git pull origin main
            docker compose pull
            docker compose up -d --build
            docker compose exec -T app npx prisma migrate deploy || true
          EOF

      - name: Health check
        run: |
          sleep 10
          curl -f https://${{ secrets.DOMAIN }}/api/health || exit 1
```

Nếu `DEPLOY_PLATFORM=vercel` → thêm `deploy.yml`:

```yaml
# .github/workflows/deploy.yml
name: Deploy to Vercel

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      - run: npm ci
      - run: npx vercel deploy --prod --token=${{ secrets.VERCEL_TOKEN }} --yes
```

Nếu `DEPLOY_PLATFORM=railway` → thêm `deploy.yml`:

```yaml
# .github/workflows/deploy.yml
name: Deploy to Railway

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      - run: npm i -g @railway/cli
      - run: railway up --environment production
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

### GitLab CI (CI_CD=gitlab-ci)

Generate `.gitlab-ci.yml`:

```yaml
# .gitlab-ci.yml
stages:
  - ci
  - deploy

variables:
  NODE_VERSION: '20'

cache:
  paths:
    - node_modules/

ci:
  stage: ci
  image: node:24-alpine
  script:
    - npm ci
    - npm run lint
    - npx tsc --noEmit
    - npm test -- --passWithNoTests
    - npm run build
  only:
    - main
    - develop
    - merge_requests

deploy:
  stage: deploy
  image: alpine
  before_script:
    - apk add --no-cache openssh-client
    - eval $(ssh-agent -s)
    - echo "$VPS_SSH_KEY" | ssh-add -
    - mkdir -p ~/.ssh && chmod 700 ~/.ssh
  script:
    - ssh -o StrictHostKeyChecking=no $VPS_USER@$VPS_HOST "cd $DEPLOY_DIR && git pull && docker compose up -d --build"
  only:
    - main
  environment:
    name: production
```

### Sau khi generate files

1. Hiển thị cho user danh sách files đã tạo
2. Hướng dẫn add Secrets vào CI/CD platform:

```
📋 Secrets cần thêm vào GitHub/GitLab:

🔸 Nếu deploy VPS:
   VPS_HOST      = <ip hoặc domain server>
   VPS_USER      = <ssh username>
   VPS_SSH_KEY   = <nội dung private key ~/.ssh/id_rsa>
   DEPLOY_DIR    = <thư mục project trên VPS, vd: /opt/myapp>
   DOMAIN        = <domain của app, vd: myapp.com>

🔸 Nếu deploy Vercel:
   VERCEL_TOKEN  = <token từ https://vercel.com/account/tokens>

🔸 Nếu deploy Railway:
   RAILWAY_TOKEN = <token từ https://railway.app/account/tokens>

📍 Cách add vào GitHub:
   Repo → Settings → Secrets and variables → Actions → New repository secret

📍 Cách add vào GitLab:
   Repo → Settings → CI/CD → Variables → Add variable
```

3. **🛑 MANDATORY WAIT — DO NOT PROCEED UNTIL USER CONFIRMS**

```
📋 Em đã generate CI/CD files xong!

⚠️ Để CI chạy được, anh cần add secrets vào platform trước.
(Xem hướng dẫn chi tiết ở trên)

Anh add xong rồi reply 'done' để em tiếp tục nhé!
```

**Rules:**
- KHÔNG tự chạy tiếp sau bước này
- KHÔNG assume user đã add secrets
- CHỈ proceed khi user reply: `done`, `ok`, `xong`, `đã add`, hoặc tương đương
- Nếu user hỏi thêm về secrets → giải thích thêm, vẫn WAIT

---

## Phase 2: CI/CD Checks (After Each Layer)

### Run Checks
```bash
# Lint
npm run lint

# Type check
npx tsc --noEmit

# Tests
npm test

# Build
npm run build
```

### If ALL PASS:
- Commit + push
- Tag layer
- Move to next layer

### If ANY FAIL:
- Return to loop agent with error
- Don't push broken code

---

## Phase 3: Deployment

### Read Config
```bash
DEPLOY_PLATFORM=$(grep DEPLOY_PLATFORM .env.local | cut -d= -f2)
```

### Load Template
Based on `DEPLOY_PLATFORM`, load instructions from:
- `.devops/templates/vercel.md`
- `.devops/templates/railway.md`
- `.devops/templates/docker-vps.md`
- `.devops/templates/generic.md`

Environment config (dev/staging/production, promotion flow): `.devops/environments.md`.

### Deploy Flow
```
Build PASS
    → Deploy to staging
    → Health check staging
    → ✅ Staging OK → Human checkpoint
    → Human approves → Deploy production
    → Health check production
    → ✅ Production OK → DONE
    → ❌ Production FAIL → Auto rollback → Notify human
```

---

## Git Workflow During Development

### Per Task
```bash
git add {relevant files}
git commit -m "feat(layer-{N}): task-{NN} {description}"
```

### Per Layer Complete
```bash
git tag "layer-{N}-done" -m "Layer {N}: {description}"
git push origin main --tags
```

### Commit Message Convention
```
feat(layer-N): task-NN description     # New feature
fix(layer-N): task-NN fix description  # Bug fix
refactor(layer-N): description         # Refactor
test(layer-N): add tests for X        # Tests only
docs: update README                    # Documentation
chore: update dependencies             # Maintenance
```

---

## Rules

1. **Never push broken code** — all checks must pass first
2. **Always tag layers** — creates rollback points
3. **Human checkpoint before production** — never auto-deploy to prod
4. **Health checks are mandatory** — verify deployment works
5. **Auto-rollback on health check failure** — don't leave broken prod

---

## Phase Final: AI-Readiness Check (SAU DEPLOY, trước khi bàn giao)

> Web không chỉ người đọc mà AI agent cũng đọc/dùng được → **ĐỌC `skills/ai-friendly-web/SKILL.md`** + chạy checklist AI-Readiness sau khi deploy:

- [ ] `llms.txt` (mục lục cho LLM) + `llms-full.txt` — sinh từ nội dung THẬT, curl test 200
- [ ] `robots.txt` — KHÔNG chặn GPTBot/ClaudeBot/PerplexityBot + có `Sitemap:`
- [ ] `sitemap.xml` — đủ trang public + `lastmod` đúng
- [ ] JSON-LD structured data cho trang public chính
- [ ] Semantic HTML/ARIA/meta đầy đủ (tái dùng frontend-checklist)
- [ ] OpenAPI spec nếu web có API public
- [ ] Verify bằng curl từng file chuẩn (không "tin là có")

> ❌ Thiếu llms.txt / chặn AI crawlers → MAJOR, sửa trước khi bàn giao.
