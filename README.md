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

기본적으로 조회 속도가 가장 중요하다고 판단이 되어, 잘 쓰이는 URL 은 별도의 Edge 서버를 두는 것이 낫다 판단했고, Cloudflare 의 treetier 버전으로도 충분히 포트폴리오의 목적을 표현할 수 있을것 같아 채택함

### Fastify (TS)

Cloudflare workers 와 같은 언어를 사용하니까, 타입 공유가 될것 같아서 채택함 <br/>
Go 로 백엔드를 구현하면 고루틴 기반으로 동시성 처리가 매우 편안하긴 한데, 개인적으로 ts 를 연습해보고 싶단 생각도 있었음.

### DB — PostgreSQL
이전 샘플코드에선 인메모리 기반으로 Java의 ConcurrenctHashMap 기반으로 만들었는데, 좀더 확장하기 위해 DB 도입을 고려하던 중 이것도 실제 써본 경험이 없어서 연습해보고 싶단 생각이 들었음. <br/>
Claude 한테 물어보니까 내 프로젝트의 성향을 고려했을때 관계형 데이터 구조(URL 매핑, 사용자, 통계 등)에 적합하고 안정성이 검증된 선택이고, 읽기 확정이 필요하면 Read Replica 를 추가하는 방향으로 대응할 수 있어서 추천한다고도 함.

### 비동기 큐 — BullMQ (Redis 기반)
클릭 로그 집계나 통걔 처리 같은 비동기 처리를 담당할 queue <br/>


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


---



## 📈 대용량 처리 고려 사항n

- **읽기 최적화 우선** — 조회:생성 비율이 약 100:1 ~ 1000:1
- **Edge 캐싱** — Cloudflare KV로 인기 URL은 DB 접근 없이 처리
- **캐시 미스 최소화** — URL 생성 시 KV에 즉시 캐싱
- **비동기 부가 작업** — 클릭 집계 등은 BullMQ로 분리하여 응답 지연 방지
- **DB 확장 여지** — Read Replica 추가로 읽기 처리량 확장 가능
