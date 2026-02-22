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

1. **스키마 변경** — `expiresAt`, `clickLimit`, `clickCount` 컬럼 추가 후 migrate
2. **BullMQ 세팅** — Redis Docker 추가, bullmq 패키지 설치
3. **click-queue** — 클릭 이벤트 집계 + clickLimit 초과 시 만료 처리
4. **expire-queue** — TTL 기반 delayed job으로 시간 만료 처리
5. **Cloudflare Workers** — Edge 레이어 연결