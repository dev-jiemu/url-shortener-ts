/**
 * shortCode 충돌 내성 테스트
 *
 * 검증:
 * 1. 서로 다른 URL 200개를 동시에 생성해도 shortCode 중복/서버 에러 없어야 함
 * 2. 같은 URL을 동시에 요청해도 shortCode가 1개만 생성되어야 함 (멱등성)
 *
 * 실행: node apps/api/test/9_shortcode_collision.test.mjs
 *
 * 사전 조건:
 *   - API 서버 실행 중 (localhost:8080)
 *   - rate limit 카운터 초기화 권장: redis-cli FLUSHDB
 *   - 배치 간 61초 대기 있음 (rate limit 10회/분 때문)
 */

import assert from 'node:assert/strict'

const API         = 'http://localhost:8080'
const TOTAL       = 200
const BATCH_SIZE  = 9       // rate limit 안전하게 9개씩
const BATCH_DELAY = 61_000  // 1분 + 1초

console.log('=== 테스트 9: shortCode 충돌 내성 ===\n')

// ─── 테스트 9-1: 서로 다른 URL 200개 동시 생성 ───────────────────────────────

console.log(`[테스트 9-1: 서로 다른 URL ${TOTAL}개 — 배치(${BATCH_SIZE}개)별 동시 생성]`)
console.log(`  예상 소요 시간: ~${Math.ceil(TOTAL / BATCH_SIZE) * (BATCH_DELAY / 1000)}초\n`)

const shortCodes = new Set()
let errorCount   = 0

for (let i = 0; i < TOTAL; i += BATCH_SIZE) {
    const batchUrls = Array.from(
        { length: Math.min(BATCH_SIZE, TOTAL - i) },
        (_, j) => `https://collision-test.com/${Date.now()}-${i + j}`
    )

    const results = await Promise.allSettled(
        batchUrls.map((url) =>
            fetch(`${API}/api/shorten`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            }).then(async (r) => ({ status: r.status, body: await r.json() }))
        )
    )

    for (const r of results) {
        if (r.status === 'fulfilled' && r.value.status === 201) {
            shortCodes.add(r.value.body.shortCode)
        } else if (r.status === 'fulfilled' && r.value.status !== 429) {
            errorCount++
            console.log(`  ⚠️  예상치 못한 응답: ${r.value.status} ${JSON.stringify(r.value.body)}`)
        }
    }

    const progress = Math.min(i + BATCH_SIZE, TOTAL)
    console.log(`  진행: ${progress} / ${TOTAL}  (고유 shortCode: ${shortCodes.size})`)

    if (progress < TOTAL) {
        process.stdout.write(`  rate limit 대기 중...`)
        await new Promise((r) => setTimeout(r, BATCH_DELAY))
        process.stdout.write(` 완료\n`)
    }
}

console.log(`\n  생성 성공: ${shortCodes.size} / ${TOTAL}`)
console.log(`  서버 에러: ${errorCount}`)

assert.equal(errorCount,      0,     '서버 에러(5xx) 없어야 함')
assert.equal(shortCodes.size, TOTAL, `shortCode ${TOTAL}개 모두 고유해야 함`)
console.log('  ✅ 테스트 9-1 통과\n')

// ─── 테스트 9-2: 같은 URL 동시 요청 — 멱등성 ────────────────────────────────

console.log('[테스트 9-2: 같은 URL 50개 동시 요청 — shortCode 1개만 생성되어야 함]')

await new Promise((r) => setTimeout(r, BATCH_DELAY)) // rate limit 리셋

const SAME_URL    = `https://collision-idempotent.com/${Date.now()}`
const SAME_CONCUR = 50

const sameResults = await Promise.allSettled(
    Array.from({ length: SAME_CONCUR }, () =>
        fetch(`${API}/api/shorten`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: SAME_URL }),
        }).then(async (r) => ({ status: r.status, body: await r.json() }))
    )
)

const sameSucceeded  = sameResults.filter((r) => r.status === 'fulfilled').map((r) => r.value)
const sameCreated    = sameSucceeded.filter((r) => r.status === 201)
const sameErrors     = sameSucceeded.filter((r) => r.status !== 201 && r.status !== 429)
const sameShortCodes = new Set(sameCreated.map((r) => r.body.shortCode))

console.log(`  201 응답:          ${sameCreated.length} / ${SAME_CONCUR}`)
console.log(`  고유 shortCode 수: ${sameShortCodes.size} (기대값: 1)`)
console.log(`  서버 에러:         ${sameErrors.length}`)

assert.equal(sameErrors.length,   0, '서버 에러 없어야 함')
assert.equal(sameShortCodes.size, 1, '동시 요청이어도 shortCode는 1개여야 함')
console.log('  ✅ 테스트 9-2 통과\n')

console.log('✅ 테스트 9 통과')
