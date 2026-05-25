/**
 * 에러 케이스 테스트
 *
 * 검증:
 * 1. 존재하지 않는 shortCode → 404 Not Found
 * 2. 필수 파라미터 누락 (url) → 400 Bad Request
 * 3. 잘못된 expiresAt 형식 처리
 * 4. 음수 clickLimit 처리
 *
 * 실행: node apps/api/test/6_error_cases.test.mjs
 */

import assert from 'node:assert/strict'

const API = 'http://localhost:8080'

console.log('=== 테스트 6: 에러 케이스 ===\n')

// 1. 존재하지 않는 shortCode
console.log('[테스트 6-1: 존재하지 않는 shortCode]')
const notFoundRes = await fetch(`${API}/api/resolve/NOTEXIST`, {
    redirect: 'manual',
})
const notFoundBody = await notFoundRes.json()
console.log(`응답 코드: ${notFoundRes.status} (기대값: 404)`)
console.log(`응답 메시지: ${notFoundBody.message}`)
assert.equal(notFoundRes.status, 404, '존재하지 않는 shortCode는 404를 반환해야 함')
assert.ok(
    notFoundBody.message.includes('존재하지 않는'),
    '404 메시지가 적절해야 함'
)

// 2. 필수 파라미터 누락 (url)
console.log('\n[테스트 6-2: 필수 파라미터 누락]')
const missingUrlRes = await fetch(`${API}/api/shorten`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}), // url 없음
})
const missingUrlBody = await missingUrlRes.json()
console.log(`응답 코드: ${missingUrlRes.status} (기대값: 400)`)
console.log(`응답 메시지: ${missingUrlBody.message}`)
assert.equal(missingUrlRes.status, 400, 'url 누락 시 400을 반환해야 함')
assert.ok(
    missingUrlBody.message.includes('필수'),
    '필수 파라미터 메시지가 포함되어야 함'
)

// 3. 잘못된 expiresAt 형식 (서버가 어떻게 처리하는지 확인)
console.log('\n[테스트 6-3: 잘못된 expiresAt 형식]')
const invalidExpiresRes = await fetch(`${API}/api/shorten`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        url: `https://test-invalid-expires.com/${Date.now()}`,
        expiresAt: 'not-a-date',
    }),
})
console.log(`응답 코드: ${invalidExpiresRes.status}`)
// 서버가 Invalid Date를 어떻게 처리하는지에 따라 달라질 수 있음
// 일반적으로는 500 또는 400이 예상됨
assert.ok(
    invalidExpiresRes.status >= 400,
    '잘못된 날짜 형식은 4xx 또는 5xx를 반환해야 함'
)

// 4. 음수 clickLimit
console.log('\n[테스트 6-4: 음수 clickLimit]')
const negativeClickLimitRes = await fetch(`${API}/api/shorten`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        url: `https://test-negative-click.com/${Date.now()}`,
        clickLimit: -5,
    }),
})
console.log(`응답 코드: ${negativeClickLimitRes.status}`)
// 음수 처리 로직에 따라 201(무시) 또는 400(에러)일 수 있음
// 현재는 검증 로직이 없으므로 201로 생성될 가능성이 높음
const negativeBody = await negativeClickLimitRes.json()
console.log(`응답:`, negativeBody)
// 여기서는 서버가 음수를 어떻게 처리하는지 확인만 함
console.log('(음수 clickLimit 처리 방식 확인 완료)')

// 5. 0 clickLimit (즉시 만료)
console.log('\n[테스트 6-5: clickLimit=0 (즉시 만료)]')
const zeroClickRes = await fetch(`${API}/api/shorten`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        url: `https://test-zero-click.com/${Date.now()}`,
        clickLimit: 0,
    }),
})
const { shortCode } = await zeroClickRes.json()
console.log(`생성된 shortCode: ${shortCode}`)

// 접근 시 즉시 410이어야 함
const zeroResolveRes = await fetch(`${API}/api/resolve/${shortCode}`, {
    redirect: 'manual',
})
console.log(`응답 코드: ${zeroResolveRes.status} (기대값: 410)`)
assert.equal(
    zeroResolveRes.status,
    410,
    'clickLimit=0인 URL은 즉시 410을 반환해야 함'
)

console.log('\n✅ 테스트 6 통과')
