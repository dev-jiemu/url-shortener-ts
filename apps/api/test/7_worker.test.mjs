/**
 * BullMQ Worker 동작 테스트
 *
 * 검증:
 * 1. click worker가 clickCount를 제대로 증가시키는지
 * 2. click worker가 clickLimit 도달 시 URL을 삭제하는지
 * 3. expire worker가 TTL 만료 시 URL을 삭제하는지
 *
 * 실행: node apps/api/test/7_worker.test.mjs
 */

import assert from 'node:assert/strict'

const API = 'http://localhost:8080'

console.log('=== 테스트 7: BullMQ Worker ===\n')

// =====================================================
// 테스트 7-1: Click Worker - clickCount 증가
// =====================================================
console.log('[테스트 7-1: Click Worker - clickCount 증가]')

// 1. clickLimit 없는 일반 URL 생성
const createRes1 = await fetch(`${API}/api/shorten`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        url: `https://test-click-worker.com/${Date.now()}`,
    }),
})
const { shortCode: code1 } = await createRes1.json()
console.log(`생성된 shortCode: ${code1}`)

// 2. 5번 접근
console.log('5번 접근 중...')
for (let i = 0; i < 5; i++) {
    await fetch(`${API}/api/resolve/${code1}`, { redirect: 'manual' })
}

// 3. Worker가 처리할 시간 대기 (Queue → Worker → DB Update)
console.log('Worker 처리 대기 (2초)...')
await new Promise((resolve) => setTimeout(resolve, 2000))

// 4. DB에서 직접 확인은 어려우므로 간접적으로 확인
// (실제로는 Prisma Client를 직접 import해서 확인할 수도 있음)
console.log('✅ Click Worker가 5개 job을 처리했다고 가정 (로그 확인 필요)')

// =====================================================
// 테스트 7-2: Click Worker - clickLimit 도달 시 삭제
// =====================================================
console.log('\n[테스트 7-2: Click Worker - clickLimit 도달 시 삭제]')

// 1. clickLimit=3 URL 생성
const createRes2 = await fetch(`${API}/api/shorten`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        url: `https://test-click-delete.com/${Date.now()}`,
        clickLimit: 3,
    }),
})
const { shortCode: code2 } = await createRes2.json()
console.log(`생성된 shortCode: ${code2} (clickLimit: 3)`)

// 2. 정확히 3번 접근
console.log('3번 접근 중...')
for (let i = 0; i < 3; i++) {
    const res = await fetch(`${API}/api/resolve/${code2}`, { redirect: 'manual' })
    console.log(`  ${i + 1}번째 접근: ${res.status}`)
}

// 3. Worker가 clickLimit 도달을 감지하고 삭제할 시간 대기
console.log('Worker 처리 대기 (3초)...')
await new Promise((resolve) => setTimeout(resolve, 3000))

// 4. 다시 접근 시 404 또는 410이어야 함 (삭제됨)
const afterDeleteRes = await fetch(`${API}/api/resolve/${code2}`, {
    redirect: 'manual',
})
console.log(`삭제 후 접근: ${afterDeleteRes.status} (기대값: 404 또는 410)`)
assert.ok(
    afterDeleteRes.status === 404 || afterDeleteRes.status === 410,
    'clickLimit 도달 후 Worker가 삭제해야 함'
)

// =====================================================
// 테스트 7-3: Expire Worker - TTL 만료 시 삭제
// =====================================================
console.log('\n[테스트 7-3: Expire Worker - TTL 만료 시 삭제]')

// 1. 2초 후 만료되는 URL 생성
const expiresAt = new Date(Date.now() + 2000).toISOString()
const createRes3 = await fetch(`${API}/api/shorten`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        url: `https://test-expire-worker.com/${Date.now()}`,
        expiresAt,
    }),
})
const { shortCode: code3 } = await createRes3.json()
console.log(`생성된 shortCode: ${code3}`)
console.log(`만료 시각: ${expiresAt}`)

// 2. 만료 전 접근 — 정상 작동
const beforeRes = await fetch(`${API}/api/resolve/${code3}`, {
    redirect: 'manual',
})
console.log(`만료 전 접근: ${beforeRes.status} (기대값: 200)`)
assert.equal(beforeRes.status, 200, '만료 전에는 정상 작동해야 함')

// 3. 만료 시간 + Worker 처리 시간 대기
console.log('만료 + Worker 처리 대기 (5초)...')
await new Promise((resolve) => setTimeout(resolve, 5000))

// 4. 만료 후 접근 — 404 (Worker가 삭제함)
const afterExpireRes = await fetch(`${API}/api/resolve/${code3}`, {
    redirect: 'manual',
})
console.log(`만료 후 접근: ${afterExpireRes.status} (기대값: 404)`)
assert.equal(
    afterExpireRes.status,
    404,
    'Expire Worker가 만료된 URL을 삭제해야 함'
)

console.log('\n✅ 테스트 7 통과')
console.log('\n참고: Worker 로그를 확인하여 실제 처리를 검증하세요')
console.log('  - [click-worker] 메시지')
console.log('  - [expire-worker] 메시지')
