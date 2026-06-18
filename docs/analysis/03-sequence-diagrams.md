# 03. 시퀀스 다이어그램 (핵심 플로우)

## 시나리오 1: URL 단축 (POST /api/shorten)

```mermaid
sequenceDiagram
    actor Client
    participant Route as UrlRoute<br/>url.route.ts
    participant RateLimit as @fastify/rate-limit<br/>(Redis rl:*)
    participant Service as UrlService<br/>url.service.ts
    participant Repo as UrlRepository<br/>url.repository.ts
    participant DB as PostgreSQL
    participant Queue as expireQueue<br/>(BullMQ)

    Client->>Route: POST /api/shorten<br/>{ url, expiresAt?, clickLimit? }
    Route->>RateLimit: IP당 10회/분 체크
    alt Rate Limit 초과
        RateLimit-->>Client: 429 Too Many Requests
    end
    Route->>Service: shorten(url, options)
    Service->>Repo: findByOriginalUrl(url)
    Repo->>DB: SELECT WHERE original_url = ?
    DB-->>Repo: Url | null
    alt 이미 존재하는 URL
        Repo-->>Service: Url
        Service-->>Route: { shortCode, originalUrl }
        Route-->>Client: 201 Created
    end
    loop 최대 5회 시도
        Service->>Service: generateShortCode() — Base62 7자리 난수
        Service->>Repo: create(originalUrl, shortCode, options)
        Repo->>DB: INSERT INTO urls ...
        alt shortCode unique 충돌 (P2002 short_code)
            DB-->>Repo: Error
            Repo-->>Service: PrismaClientKnownRequestError
            Note over Service: continue — 새 shortCode로 재시도
        end
        alt originalUrl unique 충돌 (P2002 original_url, 동시 요청)
            DB-->>Repo: Error
            Service->>Repo: findByOriginalUrl(url)
            Repo-->>Service: Url (먼저 INSERT한 레코드)
        end
        DB-->>Repo: Url (생성 성공)
        Repo-->>Service: Url
    end
    opt expiresAt 있음
        Service->>Queue: expireQueue.add('expire', { shortCode }, { delay })
        Queue-->>Service: Job 등록 완료
    end
    Service-->>Route: { shortCode, originalUrl }
    Route-->>Client: 201 Created
```

**핵심 파일/메서드 매핑**

| 단계 | 파일 | 메서드 / 라인 |
|------|------|---------------|
| 라우트 진입 | `routes/url.route.ts` | `app.post('/api/shorten', ...)` L13 |
| 서비스 호출 | `services/url.service.ts` | `UrlService.shorten()` L25 |
| 기존 URL 확인 | `repositories/url.repository.ts` | `findByOriginalUrl()` L12 |
| shortCode 생성 | `services/url.service.ts` | `generateShortCode()` L9 |
| DB 삽입 | `repositories/url.repository.ts` | `create()` L15 |
| expire 큐 등록 | `queues/index.ts` | `expireQueue.add(...)` / `url.service.ts` L64 |

---

## 시나리오 2: URL 리다이렉트 (브라우저 직접 접근)

```mermaid
sequenceDiagram
    actor Browser
    participant CFWorker as Cloudflare Worker<br/>apps/worker/src/index.ts
    participant Route as UrlRoute<br/>url.route.ts
    participant Service as UrlService
    participant Redis as Redis
    participant DB as PostgreSQL
    participant ClickQueue as click-queue<br/>(BullMQ)
    participant ClickWorker as click-worker

    Browser->>CFWorker: GET /{shortCode}
    CFWorker->>Route: GET /api/resolve/{shortCode}<br/>X-Forwarded-For: {real IP}
    Route->>Service: resolve(shortCode)
    Service->>DB: findByShortCode(shortCode)
    DB-->>Service: Url | null
    alt URL 없음
        Service-->>Route: UrlNotFoundError
        Route-->>CFWorker: 404
        CFWorker-->>Browser: 404 Not Found
    end
    alt expiresAt 초과
        Service-->>Route: UrlExpiredError
        Route-->>CFWorker: 410
        CFWorker-->>Browser: 410 Gone
    end
    opt clickLimit 있음
        Service->>Redis: SET click:limit:{shortCode} {clickCount} NX
        Service->>Redis: INCR click:limit:{shortCode}
        Redis-->>Service: current (현재 클릭 수)
        alt current > clickLimit
            Service->>Redis: DECR click:limit:{shortCode}
            Service-->>Route: UrlExpiredError
            Route-->>CFWorker: 410
            CFWorker-->>Browser: 410 Gone
        end
    end
    Service->>ClickQueue: clickQueue.add('click', { shortCode })
    Service-->>Route: originalUrl
    Route-->>CFWorker: 200 { originalUrl }
    CFWorker-->>Browser: 302 Redirect → originalUrl

    Note over ClickWorker: 비동기 처리
    ClickQueue->>ClickWorker: job dispatch
    ClickWorker->>DB: UPDATE urls SET click_count++ WHERE short_code = ?
    alt clickCount >= clickLimit
        ClickWorker->>DB: DELETE FROM urls WHERE short_code = ?
    end
```

**핵심 파일/메서드 매핑**

| 단계 | 파일 | 메서드 / 라인 |
|------|------|---------------|
| CF Worker 진입 | `apps/worker/src/index.ts` | `fetch()` handler L6 |
| API 호출 | `apps/worker/src/index.ts` | `fetch(apiUrl, ...)` L29 |
| 라우트 | `routes/url.route.ts` | `GET /api/resolve/:shortCode` L68 |
| 서비스 | `services/url.service.ts` | `UrlService.resolve()` L105 |
| Redis INCR | `services/url.service.ts` | `redisConnection.incr(key)` L131 |
| 큐 발행 | `services/url.service.ts` | `clickQueue.add(...)` L140 |
| Worker 소비 | `workers/click.worker.ts` | `startClickWorker()` L9 |

---

## 시나리오 3: TTL 만료 삭제 (Delayed Job)

```mermaid
sequenceDiagram
    participant ExpireQueue as expire-queue (Redis)
    participant ExpireWorker as expire-worker<br/>workers/expire.worker.ts
    participant DB as PostgreSQL

    Note over ExpireQueue: expireAt 시각이 되면 delayed job이 활성화
    ExpireQueue->>ExpireWorker: job { shortCode }
    ExpireWorker->>DB: findUnique({ shortCode })
    DB-->>ExpireWorker: { expiresAt } | null
    alt URL이 이미 삭제됨 or expiresAt 없음
        Note over ExpireWorker: skip (no-op)
    end
    alt expiresAt > now (아직 만료 안 됨)
        Note over ExpireWorker: skip
    end
    ExpireWorker->>DB: DELETE FROM urls WHERE short_code = ?
    Note over ExpireWorker: 로그: [expire-worker] {shortCode} — TTL 만료로 삭제
```

---

## 시나리오 4: Click Limit 초과 삭제 (클릭 Worker)

```mermaid
sequenceDiagram
    participant ClickQueue as click-queue (Redis)
    participant ClickWorker as click-worker<br/>workers/click.worker.ts
    participant DB as PostgreSQL

    ClickQueue->>ClickWorker: job { shortCode }
    ClickWorker->>DB: UPDATE urls SET click_count = click_count + 1<br/>WHERE short_code = ? RETURNING click_count, click_limit
    DB-->>ClickWorker: { clickCount, clickLimit }
    alt clickLimit != null AND clickCount >= clickLimit
        ClickWorker->>DB: DELETE FROM urls WHERE short_code = ?
        Note over ClickWorker: 로그: [click-worker] {shortCode} — clickLimit 초과로 삭제
    end
```
