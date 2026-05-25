/**
 * Rate Limiting 테스트
 *
 * 검증:
 * 1. POST /api/shorten — IP당 10회/분 제한
 * 2. 초과 시 429 Too Many Requests 반환
 * 3. Retry-After 헤더 포함 확인
 *
 * 실행: node apps/api/test/5_rate_limit.test.mjs
 */

import assert from 'node:assert/strict'

const API = 'http://localhost:8080'
const RATE_LIMIT = 10 // /api/shorten의 제한: 10회/분

console.log('=== 테스트 5: Rate Limiting ===')
console.log(`POST /api/shorten 제한: ${RATE_LIMIT}회/분\n`)

// 1. RATE_LIMIT + 5 개의 요청을 순차적으로 발송
// (동시 발송 시 서버 처리 순서에 따라 결과가 달라질 수 있음)
console.log(`${RATE_LIMIT + 5}개 요청 순차 발송 중...`)
const results = []

for (let i = 0; i < RATE_LIMIT + 5; i++) {
    const res = await fetch(`${API}/api/shorten`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: `https://rate-limit-test.com/${Date.now()}-${i}` }),
    })

    const body = await res.json()
    results.push({
        status: res.status,
        retryAfter: res.headers.get('retry-after'),
        body,
    })

    // 너무 빠르게 보내면 동시 요청으로 처리될 수 있으므로 약간의 딜레이
    await new Promise((resolve) => setTimeout(resolve, 50))
}

// 2. 결과 분석
const success201 = results.filter((r) => r.status === 201)
const rateLimit429 = results.filter((r) => r.status === 429)

console.log(`\n성공 (201): ${success201.length}개`)
console.log(`Rate Limit 초과 (429): ${rateLimit429.length}개`)

// 전체 응답 상태코드 목록 출력 (디버깅용)
console.log('\n[전체 응답 목록]')
results.forEach((r, i) => {
    console.log(`  ${i + 1}번: status=${r.status}, body=${JSON.stringify(r.body)}`)
})

// 3. 검증
assert.ok(
    success201.length <= RATE_LIMIT,
    `성공 응답은 최대 ${RATE_LIMIT}개여야 함`
)
assert.ok(
    rateLimit429.length >= 5,
    `최소 5개는 429 응답을 받아야 함`
)

// 4. 429 응답 구조 확인
if (rateLimit429.length > 0) {
    const sample = rateLimit429[0]
    console.log(`\n[429 응답 샘플]`)
    console.log(`상태 코드: ${sample.status}`)
    console.log(`메시지: ${sample.body.message}`)
    console.log(`Retry-After: ${sample.retryAfter}`)

    assert.ok(
        sample.body.message.includes('요청'),
        '에러 메시지에 "요청"이 포함되어야 함'
    )
    assert.ok(
        sample.retryAfter !== null,
        'Retry-After 헤더가 있어야 함'
    )
    assert.ok(
        Number(sample.retryAfter) > 0,
        'Retry-After는 양수여야 함'
    )
}

// 5. 1분 대기 후 다시 시도하면 성공하는지 확인 (선택적)
console.log('\n[Rate Limit 리셋 테스트는 1분이 걸리므로 스킵]')
console.log('수동 테스트: 1분 후 다시 실행하면 성공해야 함')

console.log('\n✅ 테스트 5 통과')
