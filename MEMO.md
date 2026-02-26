### PostgreSQL 
- prisma : ORM 
```typescript
const url = await prisma.url.findUnique({ where: { shortCode: 'abc123' } })
```

- pg : 직접 SQL 짜야함
```typescript
const result = await pool.query('SELECT * FROM urls WHERE short_code = $1', ['abc123'])
```

일단 prisma 로 먼저 만들고, 테이블이 늘어나고 조인이 필요하다면 sql 작성 병행 하는게 좋을듯 :)

- RETURNING
```text
-- INSERT 하고 생성된 id 바로 받기
INSERT INTO urls (short_code, original_url) VALUES ('abc', 'https://...')
RETURNING id, created_at

-- UPDATE 하고 변경된 값 바로 확인
UPDATE urls SET click_count = click_count + 1
WHERE short_code = 'abc'
RETURNING click_count

-- DELETE 하고 삭제된 행 확인
DELETE FROM urls WHERE expires_at < NOW()
RETURNING short_code
```

insert & select 또는 update & select 할 일이 생각보다 많은데 이거 편한데? ㅇㅂㅇ?

---

prisma.config.ts 에서 DATABASE_URL 읽게 하려면 dotenv 필요함
```shell
# in apps/api
pnpm add dotenv
```

마이그레이션 생성 & 적용
```shell
npx prisma migrate dev --name init

### 해당 명령어 작동 흐름
### schema.prisma 에 정의한 Url 모델을 읽어서
###  → SQL 파일 생성 (prisma/migrations/20260222115924_init/migration.sql)
###  → Docker PostgreSQL에 실제로 CREATE TABLE 실행
```

prisma client 생성
```shell
npx prisma generate
```


---

`async` : Node.js 가 기본적으로 싱글스레드라서 비동기로 I/O 구현 ㅇㅂㅇ

---

### 다음 작업 순서 👋

1. Cloudflare Workers — Edge 레이어 연결


---

bullmq 설치
```shell
# ioredis가 뭔가 했더니 Node.js에서 redis 서버랑 통신할때 쓰는 클라이언트였음
pnpm add bullmq ioredis
pnpm add -D @types/ioredis
```

worker 가 주는 작업 후 이벤트 리스너들
```typescript
worker.on('completed', (job) => {})   // job 성공적으로 완료
worker.on('failed', (job, err) => {}) // 최종 실패 (재시도 초과)
worker.on('active', (job) => {})      // job 처리 시작
worker.on('stalled', (job) => {})     // job이 멈춰버림 (워커가 갑자기 죽었을 때)
worker.on('progress', (job) => {})    // job 진행률 업데이트
worker.on('error', (err) => {})       // 워커 자체 에러 (Redis 연결 끊김 등)
```


---

rate limit 적용
```shell
# apps/api
pnpm add @fastify/rate-limit
```

```typescript
// Rate Limit 플러그인 등록
await app.register(rateLimit, {
    redis: redisConnection,           // Redis store — 멀티 인스턴스 환경에서도 카운트 공유
    nameSpace: 'rl:',                 // Redis 키 prefix (BullMQ 키와 충돌 방지)
    max: 60,                          // 전역 기본값: 60회/분
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip, // IP 기반 식별
    errorResponseBuilder: (_request, context) => ({
        // 에러 응답 포맷을 다른 에러 응답과 통일
        message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
        retryAfter: Math.ceil(context.ttl / 1000),
    }),
    // fail-open: 오류를 던지지 않고 요청을 통과시킴
    skipOnError: true,
})
```