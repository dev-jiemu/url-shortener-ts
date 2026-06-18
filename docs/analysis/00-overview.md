# 00. 프로젝트 개요

## 한 줄 요약

**URL 단축 서비스** — 긴 URL을 7자리 Base62 shortCode로 변환하고, Cloudflare Workers Edge에서 302 리다이렉트를 처리하는 시스템.

---

## 기술 스택

| 구분 | 기술 | 버전 | 근거 파일 |
|------|------|------|-----------|
| 언어 | TypeScript | ^5.0.0 | `apps/api/package.json` |
| 런타임 | Node.js | ^20 | `apps/api/package.json` (devDep `@types/node`) |
| API 프레임워크 | Fastify | ^4.0.0 | `apps/api/package.json` |
| ORM | Prisma | ^7.4.1 | `apps/api/package.json` |
| DB 드라이버 | @prisma/adapter-pg + pg | ^7.4.1 / ^8.18.0 | `apps/api/package.json` |
| 데이터베이스 | PostgreSQL | 16-alpine | `docker-compose.yml` |
| 캐시 / 메시지큐 | Redis | 7-alpine | `docker-compose.yml` |
| Redis 클라이언트 | ioredis | ^5.9.3 | `apps/api/package.json` |
| 큐 | BullMQ | ^5.70.1 | `apps/api/package.json` |
| Rate Limit | @fastify/rate-limit | ^9.1.0 | `apps/api/package.json` |
| Edge 레이어 | Cloudflare Workers | wrangler | `apps/worker/wrangler.toml` |
| 패키지 매니저 | pnpm (workspaces) | — | `pnpm-workspace.yaml` |
| 빌드 도구 | tsx (dev) / tsc (prod) | ^4.21.0 | `apps/api/package.json` |

---

## 디렉터리 구조

```
url-shortener-ts/
├── apps/
│   ├── api/                        # Fastify API 서버 (메인 백엔드)
│   │   ├── src/
│   │   │   ├── index.ts            # 진입점 — Fastify 앱 초기화, 플러그인 등록, Worker 시작
│   │   │   ├── errors.ts           # 도메인 에러 클래스 (UrlNotFoundError, UrlExpiredError)
│   │   │   ├── routes/
│   │   │   │   └── url.route.ts    # HTTP 라우트 정의 (POST /api/shorten, GET /:shortCode 등)
│   │   │   ├── services/
│   │   │   │   └── url.service.ts  # 비즈니스 로직 (단축, 조회, 만료 체크)
│   │   │   ├── repositories/
│   │   │   │   └── url.repository.ts # DB 접근 계층 (Prisma 래핑)
│   │   │   ├── queues/
│   │   │   │   └── index.ts        # BullMQ Queue 인스턴스 선언
│   │   │   ├── workers/
│   │   │   │   ├── click.worker.ts # 클릭 카운트 집계 worker (concurrency 20)
│   │   │   │   └── expire.worker.ts # TTL 만료 삭제 worker (concurrency 5)
│   │   │   └── lib/
│   │   │       ├── prisma.ts       # Prisma Client 싱글턴
│   │   │       └── redis.ts        # IORedis 싱글턴
│   │   ├── prisma/
│   │   │   ├── schema.prisma       # DB 스키마 (Url 모델)
│   │   │   └── migrations/         # 마이그레이션 이력 (3개)
│   │   ├── test/                   # 통합 테스트 (Node.js .mjs, 프레임워크 없음)
│   │   ├── .env                    # 로컬 환경변수
│   │   └── package.json
│   │
│   └── worker/                     # Cloudflare Workers Edge 레이어
│       ├── src/
│       │   └── index.ts            # CF Worker 핸들러 — shortCode 추출 후 API 호출 → 302 리다이렉트
│       └── wrangler.toml           # CF 배포 설정
│
├── packages/
│   └── types/                      # 공유 타입 패키지 (현재 비어 있음 ⚠️ 확인 필요)
│
├── docker-compose.yml              # 로컬 개발용 PostgreSQL + Redis
├── pnpm-workspace.yaml             # 모노레포 workspace 설정
└── tsconfig.base.json              # 공통 TypeScript 설정
```
