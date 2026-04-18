/**
 * clickLimit 동시 접근 (초과 방지)
 *
 * 검증: clickLimit=3 인 URL에 동시 10개 요청 시 정확히 3개만 200(리다이렉트), 나머지는 410이어야 함
 * 실행: node apps/api/test/2_click_limit_concurrent.test.mjs
 */

import assert from 'node:assert/strict'

const API = 'http://localhost:8080'
const CLICK_LIMIT = 3
const CONCURRENCY = 10

console.log('=== 테스트 2: clickLimit 동시 접근 ===')
console.log(`clickLimit: ${CLICK_LIMIT}, 동시 요청 수: ${CONCURRENCY}\n`)

// 1. clickLimit=3 URL 생성
const createRes = await fetch(`${API}/api/shorten`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        url: `https://test-click-limit.com/${Date.now()}`,
        clickLimit: CLICK_LIMIT,
    }),
})
const { shortCode } = await createRes.json()
console.log(`생성된 shortCode: ${shortCode}`)

// 2. CONCURRENCY 개 resolve 요청을 동시에 발사
//    redirect: 'manual' — 302를 따라가지 않고 상태코드만 확인
const results = await Promise.allSettled(
    Array.from({ length: CONCURRENCY }, () =>
        fetch(`${API}/api/resolve/${shortCode}`, {
            redirect: 'manual',
        }).then((r) => ({ status: r.status }))
    )
)

const statuses = results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value.status)

const ok200 = statuses.filter((s) => s === 200).length   // 리다이렉트 허용
const err410 = statuses.filter((s) => s === 410).length  // clickLimit 초과
const other = statuses.filter((s) => s !== 200 && s !== 410)

console.log(`200 (허용): ${ok200} (기대값: ${CLICK_LIMIT})`)
console.log(`410 (초과): ${err410} (기대값: ${CONCURRENCY - CLICK_LIMIT})`)
console.log(`기타: ${other.length}`)

assert.equal(ok200, CLICK_LIMIT, `정확히 ${CLICK_LIMIT}개만 통과해야 함`)
assert.equal(err410, CONCURRENCY - CLICK_LIMIT, `나머지 ${CONCURRENCY - CLICK_LIMIT}개는 410이어야 함`)

console.log('\n✅ 테스트 2 통과')
