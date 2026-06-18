# 06. 종합 & 리스크

## 전체 구조 요약

pnpm 모노레포로 구성된 URL 단축 서비스다. `apps/api`는 Fastify + Prisma + PostgreSQL 기반의 API 서버이며, `apps/worker`는 Cloudflare Workers Edge 레이어로 브라우저의 shortCode 접근을 받아 API를 호출한 뒤 302 리다이렉트를 반환한다. 클릭 집계는 BullMQ를 통해 비동기로 처리하여 리다이렉트 응답 레이턴시를 최소화하고, Redis `INCR`로 clickLimit을 원자적으로 검사하여 동시성 문제를 방지한다. TTL 만료는 BullMQ delayed job으로 정확한 시각에 DB 레코드를 삭제하는 방식을 채택했다.

---

## 발견된 기술 부채 / 위험 요소

### 1. 헬스체크 엔드포인트 없음
- API 서버에 `/health` 또는 `/ping` 엔드포인트가 없다.
- 로드밸런서나 컨테이너 오케스트레이터(K8s, ECS 등) 연동 시 헬스체크를 추가해야 한다.
- 근거: `apps/api/src/routes/url.route.ts` — `/api/shorten`, `/:shortCode`, `/api/resolve/:shortCode` 3개뿐

### 2. 프로덕션 API_BASE_URL 미설정
- `apps/worker/wrangler.toml` L15의 `API_BASE_URL`이 `https://localhost:9090`으로 placeholder 상태.
- 실제 배포 전 반드시 변경 필요.

### 3. CI/CD 파이프라인 없음
- `.github/workflows/` 등 자동화 파이프라인 파일이 존재하지 않는다.
- 현재는 수동 배포 구조.

### 4. Click Limit 이중 계산 가능성
- `resolve()`에서 Redis `INCR`로 clickLimit을 체크하고, Worker에서 DB `clickCount`를 갱신한다.
- Redis 키(`click:limit:{shortCode}`)의 TTL이 24시간으로 고정되어 있어, 서버 재시작이나 Redis 캐시 flush 시 DB `clickCount`와 Redis 카운터가 불일치할 수 있다.
- `SET key value NX` 초기화 로직이 있으나, Redis가 flush되고 다시 `NX` 초기화되면 clickCount 기준으로 리셋되므로 이미 초과된 경우도 재사용될 수 있다 (⚠️ 확인 필요).
- 근거: `services/url.service.ts:119-128`

### 5. `packages/types` 패키지 미사용
- `packages/types/` 디렉터리가 존재하나 소스 파일이 없어 공유 타입 패키지로서 활용되지 않고 있다 (⚠️ 확인 필요 — 미래 용도인지 dead code인지 불명확).

### 6. shortCode 생성이 순수 난수
- 7자리 Base62 = 약 35억 가지 조합. 현재는 충돌 시 최대 5회 재시도.
- 데이터가 수억 건으로 증가하면 충돌 확률이 높아질 수 있음. 카운터 기반 생성 전략 고려 필요.

### 7. click-worker의 이중 만료 처리 잠재적 inconsistency
- `resolve()`에서 Redis INCR으로 먼저 한도 초과를 막고, Worker가 DB에서 실제 삭제를 나중에 처리.
- 삭제 전까지 짧은 시간 동안 DB에는 레코드가 남아 있어 `findByShortCode`가 데이터를 반환하지만 Redis에서 막는 구조.
- Worker가 실패(재시도 초과)하면 DB 레코드가 삭제되지 않고 잔존할 수 있음.

---

## 문서화 · 테스트가 부족한 영역

| 영역 | 현황 |
|------|------|
| API 스펙 문서 | 없음 (OpenAPI/Swagger 미적용) |
| 단위 테스트 | 없음 — 모든 테스트가 실서버 대상 통합 테스트 |
| CI/CD | 없음 |
| 헬스체크 | 없음 |
| 에러 모니터링 | 없음 (Sentry 등 미연동) |
| 로그 수집 | Fastify 기본 pino 로그만 stdout 출력 |

---

## 신규 합류자를 위한 "여기부터 보세요" 가이드

### 1단계 — 전체 흐름 파악 (30분)
1. `docs/analysis/01-architecture.md` 컴포넌트 다이어그램 확인
2. `apps/api/src/index.ts` — 앱 진입점과 플러그인 등록 순서 확인
3. `apps/api/src/routes/url.route.ts` — 3개 엔드포인트 확인

### 2단계 — 핵심 비즈니스 로직 (1시간)
4. `apps/api/src/services/url.service.ts` — `shorten()` + `resolve()` 두 메서드
5. `docs/analysis/03-sequence-diagrams.md` 시나리오 1, 2 순서도

### 3단계 — 비동기 처리 이해 (30분)
6. `apps/api/src/queues/index.ts` — 두 개의 BullMQ 큐
7. `apps/api/src/workers/click.worker.ts` + `expire.worker.ts`

### 4단계 — 로컬 환경 구동
8. `docs/analysis/05-deployment.md` 로컬 세팅 가이드 따라 환경 구성
9. `apps/api/test/README.md` 보고 테스트 실행

### 핵심 파일 요약

| 파일 | 이유 |
|------|------|
| `apps/api/src/services/url.service.ts` | 모든 비즈니스 로직의 중심 |
| `apps/api/src/routes/url.route.ts` | API 계약 정의 |
| `apps/api/prisma/schema.prisma` | 데이터 모델 전체 |
| `apps/worker/src/index.ts` | Edge 레이어 전체 로직 (60줄) |
| `docker-compose.yml` | 로컬 인프라 구성 |
