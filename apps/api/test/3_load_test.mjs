/**
 * 부하 테스트 (응답속도 + BullMQ 큐 처리량)
 *
 * autocannon 없이 Node 내장 기능으로 구현한 간단한 부하 테스트
 * 검증: 10초간 100 동시접속 → 평균 응답시간, 처리량, 에러율 측정
 *
 * 실행: node apps/api/test/3_load_test.mjs
 */

const API = 'http://localhost:8080'
const DURATION_MS = 10_000   // 10초
const CONCURRENCY = 100      // 동시 요청 수
const TARGET_ERROR_RATE = 5  // 허용 에러율 (%)

console.log('=== 테스트 3: 부하 테스트 ===')
console.log(`지속 시간: ${DURATION_MS / 1000}초, 동시 요청: ${CONCURRENCY}\n`)

// 1. 테스트용 URL 미리 생성
const createRes = await fetch(`${API}/api/shorten`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: `https://load-test-target.com/${Date.now()}` }),
})
const { shortCode } = await createRes.json()
console.log(`테스트 shortCode: ${shortCode}`)
console.log('부하 테스트 시작...\n')

// 2. 부하 생성
const stats = { total: 0, success: 0, error: 0, latencies: [] }
const startTime = Date.now()

// worker 함수 — 제한 시간 동안 계속 요청
async function worker() {
    while (Date.now() - startTime < DURATION_MS) {
        const t0 = Date.now()
        try {
            const res = await fetch(`${API}/api/resolve/${shortCode}`, {
                redirect: 'manual',
            })
            const latency = Date.now() - t0
            stats.latencies.push(latency)
            stats.total++
            if (res.status === 200 || res.status === 302) {
                stats.success++
            } else {
                stats.error++
            }
        } catch {
            stats.total++
            stats.error++
        }
    }
}

// CONCURRENCY 개 worker 동시 실행
await Promise.all(Array.from({ length: CONCURRENCY }, worker))

// 3. 결과 계산
const elapsed = (Date.now() - startTime) / 1000
const rps = (stats.total / elapsed).toFixed(1)
const errorRate = ((stats.error / stats.total) * 100).toFixed(2)

stats.latencies.sort((a, b) => a - b)
const p50 = stats.latencies[Math.floor(stats.latencies.length * 0.5)]
const p95 = stats.latencies[Math.floor(stats.latencies.length * 0.95)]
const p99 = stats.latencies[Math.floor(stats.latencies.length * 0.99)]
const avg = (stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length).toFixed(1)

console.log('=== 결과 ===')
console.log(`총 요청:       ${stats.total}`)
console.log(`성공:          ${stats.success}`)
console.log(`에러:          ${stats.error}`)
console.log(`처리량 (RPS):  ${rps} req/s`)
console.log(`에러율:        ${errorRate}%  (허용: ${TARGET_ERROR_RATE}%)`)
console.log(`평균 응답:     ${avg}ms`)
console.log(`p50:           ${p50}ms`)
console.log(`p95:           ${p95}ms`)
console.log(`p99:           ${p99}ms`)

import assert from 'node:assert/strict'
assert.ok(
    parseFloat(errorRate) <= TARGET_ERROR_RATE,
    `에러율 ${errorRate}% 가 허용치 ${TARGET_ERROR_RATE}% 초과`
)

console.log('\n✅ 테스트 3 통과')
