/**
 * 같은 URL 동시 단축 요청 (shortCode 중복 충돌 방지)
 *
 * 검증: 동시에 N개 요청해도 DB에 row가 1개만 생기고, 모두 같은 shortCode를 받아야 함
 * 실행: node apps/api/test/1_shorten_concurrent.test.mjs
 */

import assert from 'node:assert/strict'

const API = 'http://localhost:8080'
const TARGET_URL = `https://test-concurrent-shorten.com/${Date.now()}` // 매 실행마다 새 URL
const CONCURRENCY = 30

console.log('=== 테스트 1: 같은 URL 동시 단축 요청 ===')
console.log(`동시 요청 수: ${CONCURRENCY}`)
console.log(`대상 URL: ${TARGET_URL}\n`)

// CONCURRENCY 개 요청을 동시에 발사
const results = await Promise.allSettled(
    Array.from({ length: CONCURRENCY }, () =>
        fetch(`${API}/api/shorten`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: TARGET_URL }),
        }).then((r) => r.json())
    )
)

const succeeded = results.filter((r) => r.status === 'fulfilled').map((r) => r.value)
const failed = results.filter((r) => r.status === 'rejected')

console.log(`성공 응답: ${succeeded.length} / ${CONCURRENCY}`)
console.log(`실패 응답: ${failed.length} / ${CONCURRENCY}`)

// 모든 응답이 같은 shortCode를 가져야 함
const shortCodes = new Set(succeeded.map((r) => r.shortCode))
console.log(`고유 shortCode 수: ${shortCodes.size} (기대값: 1)`)
console.log(`shortCode: ${[...shortCodes][0]}`)

assert.equal(failed.length, 0, '모든 요청이 성공해야 함')
assert.equal(shortCodes.size, 1, '동시 요청이어도 shortCode는 1개여야 함')

console.log('\n✅ 테스트 1 통과')
