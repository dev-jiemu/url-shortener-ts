# 05. 배포 방법 (Deployment)

## 배포 파이프라인 다이어그램

> ⚠️ CI/CD 파이프라인 파일(`.github/workflows/`, `Jenkinsfile` 등) 없음. 현재는 수동 배포 구조.

```mermaid
graph LR
    A["코드 작성"] --> B["로컬 테스트\nnode test/*.mjs"]
    B --> C["API 서버 빌드\ntsc"]
    B --> D["CF Worker 배포\nwrangler deploy"]
    C --> E["서버에서 실행\nnode dist/index.js"]
    D --> F["Cloudflare Edge\n글로벌 PoP"]
    E --> G["헬스 확인\n:8080 응답"]
```

---

## 로컬 개발 환경 세팅 가이드

### 1. 사전 요구사항

- Node.js 20+
- pnpm
- Docker & Docker Compose

### 2. 인프라 기동 (PostgreSQL + Redis)

```bash
# 프로젝트 루트
docker compose up -d
```

컨테이너 확인:
```bash
docker compose ps
# url-shortener-postgres  :5432
# url-shortener-redis     :6379
```

### 3. 환경변수 설정

`apps/api/.env` 파일 (이미 존재, 로컬 기본값):

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/url_shortener"
REDIS_HOST=localhost
REDIS_PORT=6379
PORT=8080
```

### 4. DB 마이그레이션

```bash
cd apps/api
pnpm prisma:migrate   # prisma migrate dev
pnpm prisma:generate  # prisma generate (타입 생성)
```

### 5. API 서버 실행

```bash
# 프로젝트 루트
pnpm dev:api
# 또는
cd apps/api && pnpm dev   # tsx watch src/index.ts
```

서버 시작 확인:
```bash
curl http://localhost:8080/api/shorten \
  -X POST -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}'
```

### 6. Cloudflare Worker 실행 (선택)

```bash
# 프로젝트 루트
pnpm dev:worker
# 또는
cd apps/worker && npx wrangler dev
# → http://localhost:8787
```

---

## 테스트 실행

```bash
cd apps/api/test

# 개별 실행
node 1_shorten_concurrent.test.mjs
node 2_click_limit_concurrent.test.mjs
node 3_load_test.mjs
node 4_expiration.test.mjs
node 5_rate_limit.test.mjs
node 6_error_cases.test.mjs
node 7_worker.test.mjs

# 또는 shell 스크립트 (apps/api/test/run-all-tests.sh 존재)
bash run-all-tests.sh
```

> ⚠️ Rate Limit 테스트(5번) 후 1분 대기 필요. 자세한 내용: `apps/api/test/README.md`

---

## 프로덕션 빌드

```bash
cd apps/api
pnpm build   # tsc → dist/ 생성
node dist/index.js
```

---

## Cloudflare Worker 배포

```bash
cd apps/worker
npx wrangler deploy
```

프로덕션 `API_BASE_URL` 설정 필요:

```toml
# apps/worker/wrangler.toml
[env.production.vars]
API_BASE_URL = "https://your-api-server.com"  # ⚠️ 현재 localhost:9090 — 변경 요망
```

---

## 환경변수 표

### apps/api

| 키 | 필수 | 설명 |
|----|------|------|
| `DATABASE_URL` | 필수 | PostgreSQL 연결 문자열 (Prisma) |
| `REDIS_HOST` | 필수 | Redis 호스트 (기본값: `localhost`) |
| `REDIS_PORT` | 선택 | Redis 포트 (기본값: `6379`) |
| `PORT` | 선택 | API 서버 포트 (기본값: `8080`) |
| `NODE_ENV` | 선택 | `production` 설정 시 Prisma 쿼리 로그 비활성화 |

### apps/worker (wrangler vars)

| 키 | 필수 | 설명 |
|----|------|------|
| `API_BASE_URL` | 필수 | Fastify API 서버 주소 (로컬: `http://localhost:8080`) |

---

## 헬스체크

| 엔드포인트 | 방법 | 설명 |
|------------|------|------|
| `GET /health` | CF Worker | wrangler dev 기동 확인용 (`apps/worker/src/index.ts:11`) |
| `POST /api/shorten` + `GET /:shortCode` | API 서버 | 별도 헬스체크 엔드포인트 없음 ⚠️ |

---

## 컨테이너 구성 (docker-compose.yml)

| 서비스 | 이미지 | 포트 | 영속성 |
|--------|--------|------|--------|
| `postgres` | postgres:16-alpine | 5432 | volume `postgres_data` |
| `redis` | redis:7-alpine | 6379 | volume `redis_data` (AOF 활성화) |

Redis는 `--appendonly yes` 옵션으로 AOF 영속성이 활성화되어 있어 재시작 후에도 BullMQ job이 보존된다.
