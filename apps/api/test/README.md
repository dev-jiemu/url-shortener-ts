# URL Shortener API 테스트

## 🧪 테스트 목록

| 번호 | 파일 | 테스트 내용 | 소요 시간 |
|------|------|-------------|-----------|
| 1 | `1_shorten_concurrent.test.mjs` | 동시 단축 요청 (shortCode 중복 방지) | ~1초 |
| 2 | `2_click_limit_concurrent.test.mjs` | clickLimit 동시 접근 (초과 방지) | ~1초 |
| 3 | `3_load_test.mjs` | 부하 테스트 (응답속도 + 처리량) | 10초 |
| 4 | `4_expiration.test.mjs` | TTL 만료 처리 | ~6초 |
| 5 | `5_rate_limit.test.mjs` | Rate Limiting (IP당 제한) | ~2초 |
| 6 | `6_error_cases.test.mjs` | 에러 케이스 (404, 400 등) | ~1초 |
| 7 | `7_worker.test.mjs` | BullMQ Worker 동작 확인 | ~12초 |

## 📋 사전 요구사항

테스트 실행 전 다음이 준비되어 있어야 합니다:

1. **API 서버가 실행 중이어야 함**
   ```bash
   pnpm --filter api dev
   # 또는
   cd apps/api && pnpm dev
   ```

2. **PostgreSQL이 실행 중이어야 함**
   - Prisma 연결 확인: `.env`의 `DATABASE_URL`

3. **Redis가 실행 중이어야 함**
   - BullMQ와 Rate Limiting에 필요
   - `.env`의 `REDIS_URL` 확인

4. **서버가 `localhost:8080`에서 실행 중이어야 함**
   - 다른 포트 사용 시 테스트 파일의 `API` 변수 수정 필요

## 🚀 실행 방법

### 전체 테스트 순차 실행
```bash
# apps/api/test 디렉토리에서
node 1_shorten_concurrent.test.mjs
node 2_click_limit_concurrent.test.mjs
node 3_load_test.mjs
node 4_expiration.test.mjs
node 5_rate_limit.test.mjs
node 6_error_cases.test.mjs
node 7_worker.test.mjs
```

### 개별 테스트 실행
```bash
# 프로젝트 루트에서
node apps/api/test/4_expiration.test.mjs

# 또는 apps/api 디렉토리에서
node test/4_expiration.test.mjs
```

### 한 번에 모든 테스트 실행 (Bash)
```bash
cd apps/api/test
for test in {1..7}_*.test.mjs; do
    echo "===== Running $test ====="
    node "$test" || exit 1
    echo ""
done
```

## ⚠️ 주의사항

### Rate Limit 테스트 (5번)
- **테스트 간 1분 이상 간격 필요**
- Rate Limit이 걸려있으면 다른 테스트에 영향
- 순차 실행 시 5번 테스트 후 1분 대기 권장

### Worker 테스트 (7번)
- **서버 로그 확인 필수**
- Worker 처리 메시지 확인:
  ```
  [click-worker] abc123 — clickLimit 초과로 삭제
  [expire-worker] xyz789 — TTL 만료로 삭제
  ```
- 테스트가 통과해도 로그에서 실제 처리 확인 필요

### 부하 테스트 (3번)
- 10초 동안 대량 요청 발생
- 로컬 환경 성능에 따라 결과 달라질 수 있음
- 실제 프로덕션 환경 성능 측정 아님

## 🔧 문제 해결

### 테스트 실패 시 체크리스트

1. **API 서버가 실행 중인가?**
   ```bash
   curl http://localhost:8080/api/health  # health check endpoint 있다면
   ```

2. **PostgreSQL 연결 확인**
   ```bash
   psql $DATABASE_URL -c "SELECT 1;"
   ```

3. **Redis 연결 확인**
   ```bash
   redis-cli ping  # PONG 응답 확인
   ```

4. **Rate Limit 초기화 (필요 시)**
   ```bash
   redis-cli FLUSHDB 
   ```

5. **포트 충돌 확인**
   ```bash
   lsof -i :8080  # 8080 포트 사용 프로세스 확인
   ```

## 📊 테스트 결과 예시

```
=== 테스트 4: TTL 만료 ===

생성된 shortCode: aBc123X
만료 시각: 2024-01-15T10:30:01.000Z

[만료 전 접근 테스트]
응답 코드: 200 (기대값: 200)

1.5초 대기 중 (만료 시간 경과)...

[만료 후 접근 테스트]
응답 코드: 410 (기대값: 410)
응답 메시지: 만료된 URL입니다.

[Expire Worker 처리 대기]
3초 대기 중 (expire worker가 DB에서 삭제할 시간)...
최종 응답 코드: 404 (기대값: 404 또는 410)

✅ 테스트 4 통과
```