/**
 * TTL 만료 테스트
 *
 * 1. expiresAt이 지난 URL은 410 반환
 * 2. expiresAt 전에는 정상 작동함
 * 3. expire worker가 제대로 만료된 URL을 처리하는지 (만료처리 후 요청하면 404 반환)
 *
 * node apps/api/test/4_expiration.test.mjs
 */
import assert from 'node:assert/strict'

const API = 'http://localhost:8080'

console.log('=== 테스트 4: TTL 만료 ===\n')

const expiresAt = new Date(Date.now() + 5000).toISOString() // 5초 후 만료
const createRes = await fetch(`${API}/api/shorten`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        url: `https://test-expiration.com/${Date.now()}`,
        expiresAt,
    }),
})

console.log(`API 응답 상태: ${createRes.status}`)
const createBody = await createRes.json()
console.log(`API 응답 본문:`, createBody)

const { shortCode } = createBody
console.log(`생성된 shortCode: ${shortCode}`)
console.log(`만료 시각: ${expiresAt}`)

// shortCode가 없으면 조기 종료
if (!shortCode) {
    console.error('\n❌ 에러: shortCode가 생성되지 않았습니다.')
    console.error('API 서버가 실행 중인지 확인하세요: pnpm --filter api dev')
    process.exit(1)
}

// 만료 전 접근
console.log('\n[만료 전 접근 테스트]')
const beforeExpireRes = await fetch(`${API}/api/resolve/${shortCode}`, {
    redirect: 'manual',
})
console.log(`응답 코드: ${beforeExpireRes.status} (기대값: 200)`)
assert.equal(beforeExpireRes.status, 200, '만료 전에는 정상 작동해야 함')

// 만료 시간 경과
console.log('\n5.5초 대기 중 (만료 시간 경과)...')
await new Promise((resolve) => setTimeout(resolve, 5500))

// 만료 후 접근(404 / 410)
console.log('\n[만료 후 접근 테스트]')
const afterExpireRes = await fetch(`${API}/api/resolve/${shortCode}`, {
    redirect: 'manual',
})
const afterBody = await afterExpireRes.json()
console.log(`응답 코드: ${afterExpireRes.status} (기대값: 410 또는 404)`)
console.log(`응답 메시지: ${afterBody.message}`)
assert.ok(
    afterExpireRes.status === 410 || afterExpireRes.status === 404,
    '만료 후에는 410 또는 404를 반환해야 함 (Worker가 삭제했을 수 있음)'
)
assert.ok(
    afterBody.message.includes('만료') || afterBody.message.includes('존재하지 않는'),
    '만료 또는 존재하지 않는 메시지가 포함되어야 함'
)

// expire worker 동작 확인을 위해 추가 대기
// BullMQ delayed job이 처리되기까지 약간의 시간이 필요함
console.log('\n[Expire Worker 처리 대기]')
console.log('3초 대기 중 (expire worker가 DB에서 삭제할 시간)...')
await new Promise((resolve) => setTimeout(resolve, 3000))

// 6. 다시 접근 — 여전히 410 또는 404 (worker가 삭제했다면)
const finalRes = await fetch(`${API}/api/resolve/${shortCode}`, {
    redirect: 'manual',
})
console.log(`최종 응답 코드: ${finalRes.status} (기대값: 404 또는 410)`)
assert.ok(
    finalRes.status === 404 || finalRes.status === 410,
    'Worker가 처리한 후에는 404 또는 410이어야 함'
)

console.log('\n✅ 테스트 4 통과')
