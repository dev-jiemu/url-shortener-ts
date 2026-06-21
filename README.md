#  🔗 Short URL Service

개인 포트폴리오 프로젝트 — 대용량 트래픽을 고려한 Short URL 서비스

---

## 🔗 이전 레포지토리

아래 Java SpringBoot 샘플을 기반으로 설계를 참고하여 재구현진행함.

- [url-shortener (Java / SpringBoot)](https://github.com/dev-jiemu/url-shortener)
  - In-memory 기반 단축 URL API 서버
  - 영속성, 캐싱, 대용량 처리 등을 고려한 확장 버전으로 재설계

## 📌 Info
아래 기능을 담당하는 프로젝트
- 긴 url 정보를 간단한 코드로 변환
- 변환된 url로 접근했을때 원본 url로 리다이렉트 처리

---

## 🏗️ 전체 아키텍처

### 읽기 Flow (조회)

```
사용자 클릭
  → Cloudflare Workers (Edge)
      → KV 조회
          ├── HIT  → 302 Redirect (백엔드 호출 X)
          └── MISS → 내 백엔드 서버 호출
                      → DB 조회
                          ├── 존재함 → KV 캐싱 → 302 Redirect
                          └── 없음   → 404 반환
```

### 쓰기 Flow (생성)

```
생성자 요청
  → 백엔드 API
      → short code 생성 (Base62 인코딩)
      → DB 저장 (PostgreSQL Primary)
      → Cloudflare KV에 즉시 캐싱
      → 202 Accepted 응답 반환 (빠른 응답)

      (비동기) → BullMQ 큐
                  → 클릭 로그 집계
                  → 통계 처리
                  → 기타 부가 작업
```

### 전체 스택 구성도

```
[사용자]
   ↓
[Cloudflare Workers + KV]  ← Edge 레이어 (전 세계 분산)
   ↓ (캐시 미스 시)
[Fastify 백엔드 (TypeScript)]
   ↓               ↓
[PostgreSQL]     [Redis]
                   ↓
               [BullMQ]  ← 비동기 작업 큐
```


---

## 기술 선택에 대한 고민 🤔

### Edge — Cloudflare Workers + KV

기본적으로 조회 속도가 가장 중요하다고 판단이 되어, 잘 쓰이는 URL 은 별도의 Edge 서버를 두는 것이 낫다 판단했고, Cloudflare 의 free-tier 버전으로도 충분히 포트폴리오의 목적을 표현할 수 있을것 같아 채택함

### Fastify (TS)

Cloudflare workers 와 같은 언어를 사용하니까, 타입 공유가 될것 같아서 채택함 <br/>
Go 로 백엔드를 구현하면 고루틴 기반으로 동시성 처리가 매우 편안하긴 한데, 개인적으로 ts 를 연습해보고 싶단 생각도 있었음.

### DB — PostgreSQL
이전 샘플코드에선 인메모리 기반으로 Java의 ConcurrenctHashMap 기반으로 만들었는데, 좀더 확장하기 위해 DB 도입을 고려하던 중 이것도 실제 써본 경험이 없어서 연습해보고 싶단 생각이 들었음. <br/>
Claude 한테 물어보니까 내 프로젝트의 성향을 고려했을때 관계형 데이터 구조(URL 매핑, 사용자, 통계 등)에 적합하고 안정성이 검증된 선택이고, 읽기 확정이 필요하면 Read Replica 를 추가하는 방향으로 대응할 수 있어서 추천한다고도 함.

### 비동기 큐 — BullMQ (Redis 기반)
클릭 로그 집계나 통계 처리 같은 비동기 처리를 담당할 queue <br/>
URL 만료 처리도 BullMQ가 담당할 예정 (아래 URL 만료 정책 참고)


---

## 📁 프로젝트 구조 (예정)

```
/
├── apps/
│   ├── api/          # Fastify 백엔드
│   └── worker/       # Cloudflare Workers
├── packages/
│   └── types/        # 공유 타입 정의
└── README.md
```

‼️ 참고 : 서로 설정이 섞이지 않는 `모노레포` 구조로 생성함 (pnpm worpspace)

---

## 📈 대용량 처리 고려 사항

- **읽기 최적화 우선** — 조회:생성 비율이 약 100:1 ~ 1000:1
- **Edge 캐싱** — Cloudflare KV로 인기 URL은 DB 접근 없이 처리
- **캐시 미스 최소화** — URL 생성 시 KV에 즉시 캐싱
- **비동기 부가 작업** — 클릭 집계 등은 BullMQ로 분리하여 응답 지연 방지
- **DB 확장 여지** — Read Replica 추가로 읽기 처리량 확장 가능

---

## ⏰ URL 만료 정책 생각해보기 

Short URL에 만료 조건을 부여하여 대용량 처리의 엣지케이스를 고려해볼 예정

### 만료 조건 (생성 시 선택)
- **시간 기반 (TTL)** — 생성 후 N시간/일이 지나면 자동 만료
- **횟수 기반 (Click Limit)** — 클릭 횟수가 N회를 초과하면 만료

### 만료 처리 흐름

```
URL 생성
  → DB 저장 (expiresAt, clickLimit 컬럼 추가 예정)
  → BullMQ delayed job 등록 (TTL 설정 시 — N초 후 삭제 예약)

URL 클릭
  → 302 응답 (즉시)
  → BullMQ에 click 이벤트 던짐 (비동기)
      → clickCount 집계
      → clickLimit 초과 시 삭제
```

### 스키마 변경해야함 :)
```
Url {
  ...기존 컬럼
  expiresAt  DateTime?  // null이면 무기한
  clickLimit Int?       // null이면 무제한
  clickCount Int        // 현재 클릭수
}
```

### BullMQ 큐 구성 할거 ㅇㅂㅇ
- `click-queue` — 클릭 이벤트 집계, clickLimit 초과 체크
- `expire-queue` — TTL 기반 delayed job으로 만료 시각에 삭제 실행


---

click limit 추가
- short url 만들었을때 해당 url 로 몇번 접근 가능한지 설정
- redis 원자적 처리
```text
clickLimit 있는 URL 접근 시
  → Redis 키 없음? → DB clickCount로 초기화 (SET NX)
  → INCR으로 +1 (원자적)
  → 결과 > clickLimit? → DECR으로 되돌리고 UrlExpiredError
  → 통과하면 기존처럼 BullMQ 큐에 click job 추가
```

### 테스트 코드 실행 명령어 모음 ㅇㅂㅇ
```shell
# 동시 단축 요청 (shortCode 중복 방지)
node apps/api/test/1_shorten_concurrent.test.mjs

# clickLimit 동시 접근
node apps/api/test/2_click_limit_concurrent.test.mjs

# 부하 테스트 (10초)
node apps/api/test/3_load_test.mjs
```

---

## 🌊 이벤트 드라이븐 확장 로드맵 (Event-Driven Roadmap)

> 하려는거 : 지금의 **작업 큐(BullMQ)** 패턴을 넘어서, 하나의 이벤트를 여러 컨슈머가
> 각자 소비하는 **fan-out** 과 이벤트를 로그로 쌓아 재생하는 **이벤트 소싱** 구현해보기 ㅇㅂㅇ

### 현재 구조 (As-Is)

```
resolve()
  → clickQueue.add('click', { shortCode })   // 단일 job
      → click.worker (단일 컨슈머)
          → DB clickCount +1
          → clickLimit 초과 시 삭제
```

- `click job` 하나를 워커 하나가 처리하는 **competing-consumers(작업 큐)** 모델
- 클릭에 반응하는 동작을 추가하려면 worker 로직을 직접 수정해야 함 → 결합도 높음

### 목표 구조 (To-Be) — Redis Streams 기반 fan-out

```
resolve()
  → XADD url:clicked * shortCode ...   // 이벤트 발행 (append-only 로그)
      │
      ├── 집계 컨슈머   → DB clickCount 갱신 + clickLimit 체크   (기존 click.worker 로직 이전)
      ├── 통계 컨슈머   → 시간대별 / 일자별 클릭 수 집계         (신규)
      └── 분석 컨슈머   → referer · 지역(geo) 분포 집계          (신규)

  ※ 각 컨슈머는 독립된 Consumer Group 으로 동작 → 하나가 죽어도 나머지는 정상
  ※ Stream 은 이벤트가 로그로 남으므로 처음부터 replay 가능
```

> 💡 **BullMQ 는 유지** — `expire-queue` 의 delayed job(만료 예약)은 Streams 가 기본 지원하지
> 않는 기능이라 그대로 둠. "지연 실행은 BullMQ, 이벤트 fan-out 은 Streams" 로 역할 분담.

### 단계별 계획 (Phases)

#### Phase 0 — 이벤트 스키마 정의
- [ ] `packages/types` 에 `UrlClickedEvent` 타입 정의 (마침 비어있는 패키지 활용)
- [ ] 이벤트 필드 확정 : `shortCode`, `clickedAt`, `referer?`, `ip?`, `country?`
- 학습 포인트 : 이벤트는 "무슨 일이 일어났는가(과거형)" 를 표현 → `url.clicked`

#### Phase 1 — Redis Streams 도입 & fan-out 전환
- [ ] `resolve()` 의 `clickQueue.add('click')` → `XADD url:clicked` 로 교체
- [ ] 기존 `click.worker` 로직을 **집계 컨슈머**로 이전 (Consumer Group `agg`)
- [ ] **통계 컨슈머** 신규 추가 (Consumer Group `stats`) — 같은 이벤트를 독립 소비
- [ ] 컨슈머 그룹별 `XREADGROUP` + `XACK` 처리, 미처리 메시지 `XPENDING` 확인
- 학습 포인트 : 같은 이벤트 → N개 컨슈머가 **각자** 소비하는 fan-out 감각

#### Phase 2 — 이벤트 소싱 (clickCount 불일치 정공법 해결)
- [ ] 클릭 이벤트를 append-only 로그로 보존 (Stream 자체 or 별도 `click_events` 테이블)
- [ ] clickCount 를 "현재 상태 컬럼" 이 아니라 **이벤트 재생(replay) 결과** 로 계산 가능하게
- [ ] 아래 TODO 의 "Redis flush 시 clickCount 불일치" 를 이 구조로 해결
- 학습 포인트 : 상태(state)를 저장하지 않고, 상태를 만든 사건(event)을 저장한다

#### Phase 3 — 실패 처리 & DLQ
- [ ] 컨슈머 최종 실패 메시지를 `url:clicked:dead` 스트림으로 이동 (Dead Letter)
- [ ] 아래 TODO 의 "click-worker 실패 시 DB 레코드 잔존" 과 연계
- 학습 포인트 : 분산 시스템에서 "실패한 이벤트를 어디에 모아 어떻게 재처리하나"

#### Phase 4 — (옵션) 서비스 분리 / 브로커 교체 검토
- [ ] 통계·분석 컨슈머를 별도 프로세스(서비스)로 분리
- [ ] 트래픽·보존(retention) 요구가 커지면 Redis Streams → Kafka 교체 검토
- 학습 포인트 : MSA 서비스 간 이벤트 통신, 로그 보존/재생의 차이

---

## 🚧 앞으로 해야할 일 (Known Issues & TODOs)

코드 분석 중 발견한 리스크와 미완성 항목들

### [ ] 헬스체크 엔드포인트 추가
- 현재 API 서버에 `/health` 엔드포인트가 없음
- 로드밸런서나 컨테이너 오케스트레이터(K8s, ECS 등) 연동 시 필요
- `apps/api/src/routes/url.route.ts` 에 추가 필요

### [ ] CI/CD 파이프라인 구성
- `.github/workflows/` 등 자동화 파이프라인이 없어 현재 수동 배포 구조
- 빌드 → 테스트 → 배포 자동화 필요

### [ ] wrangler.toml 프로덕션 API_BASE_URL 설정
- `apps/worker/wrangler.toml` L15의 `API_BASE_URL`이 `https://localhost:9090` placeholder 상태
- 실제 배포 전 반드시 변경 필요

### [ ] Redis flush 시 Click Limit 카운터 불일치 해결
- `resolve()` 에서 Redis `INCR`로 clickLimit을 체크하고 Worker가 DB `clickCount`를 나중에 갱신하는 구조
- Redis가 초기화되면 DB `clickCount` 기준으로 리셋되는데, 이미 한도에 가까운 경우 초과 접근이 허용될 수 있음
- 근거: `apps/api/src/services/url.service.ts:119-128`

### [ ] click-worker 실패 시 DB 레코드 잔존 처리
- Worker가 재시도 초과로 최종 실패하면 DB에서 만료된 URL이 삭제되지 않고 남음
- Dead Letter Queue 또는 별도 정리 배치 고려 필요

### [ ] shortCode 생성 전략 개선 검토
- 현재 7자리 Base62 순수 난수 생성 + 최대 5회 재시도
- 데이터가 수억 건으로 증가하면 충돌 확률 증가 → 카운터 기반 생성 전략 검토 필요

### [ ] packages/types 패키지 활용 or 제거
- `packages/types/` 가 존재하나 소스 파일이 없는 상태
- 공유 타입을 여기에 모을 계획이라면 `UrlService.ShortenOptions` 등 이동, 아니면 디렉터리 삭제

---

### memo : prisma migrate 관련 명령어 모음
```shell
# Prisma 마이그레이션 실행
npx prisma migrate dev

# Prisma Studio로 DB 확인 (GUI 툴)
npx prisma studio

# 초기화 하고 싶으면
npx prisma migrate reset
# 아니면 docker-compose down 해도 되긴 함
```