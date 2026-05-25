/**
 *  스트레스 테스트
 *  사전준비 : resolvePool 용 URL 9개 생성
 *  Phase 1  : 램프업 부하 (동시 50 → 200 → 500 → 1000)
 *  Phase 2  : clickLimit 대량 동시 접근 (limit=50, 요청=500)
 *  Phase 3  : BullMQ 큐 적체 (3초간 500 동시 → Worker 처리 확인)
 *  Phase 4  : 혼합 시나리오 (생성 20% / 조회 70% / 만료 URL 10%) 30초
 *
 *  돌리기 전에 redis-cli FLUSHDB 한번 날려줄것
 */

import assert from 'node:assert/strict'

const API           = 'http://localhost:8080'
const ERR_THRESHOLD = 1  // 에러율 허용치 (%)

// ─── 유틸 ────────────────────────────────────────────────────────────────────

function makeStats() {
    return { total: 0, success: 0, error: 0, latencies: [] }
}

function calcPercentile(sorted, p) {
    return sorted[Math.floor(sorted.length * p)] ?? 0
}

function printStats(label, stats, elapsedMs) {
    const sorted  = [...stats.latencies].sort((a, b) => a - b)
    const elapsed = elapsedMs / 1000
    const rps     = (stats.total / elapsed).toFixed(1)
    const errRate = stats.total ? ((stats.error / stats.total) * 100).toFixed(2) : '0.00'
    const avg     = sorted.length ? (sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(1) : '0'

    console.log(`  [${label}]`)
    console.log(`    총 요청: ${stats.total}  성공: ${stats.success}  에러: ${stats.error}`)
    console.log(`    RPS: ${rps}  에러율: ${errRate}%`)
    console.log(`    avg: ${avg}ms  p50: ${calcPercentile(sorted, 0.5)}ms  p95: ${calcPercentile(sorted, 0.95)}ms  p99: ${calcPercentile(sorted, 0.99)}ms`)
    if (stats.errorDist && Object.keys(stats.errorDist).length > 0) {
        console.log(`    에러 분포: ${JSON.stringify(stats.errorDist)}`)
    }
    return { rps: parseFloat(rps), errRate: parseFloat(errRate) }
}

async function timedFetch(url, options) {
    const t0 = Date.now()
    try {
        const res = await fetch(url, options)
        return { res, latency: Date.now() - t0 }
    } catch {
        return { res: null, latency: Date.now() - t0 }
    }
}

async function runLoad(fetchFn, concurrency, durationMs) {
    const stats = makeStats()
    const start = Date.now()
    async function worker() {
        while (Date.now() - start < durationMs) {
            const { res, latency } = await fetchFn()
            stats.total++
            stats.latencies.push(latency)
            if (res && res.status >= 200 && res.status < 500) {
                stats.success++
            } else {
                stats.error++
                // 에러 상태코드 집계
                const key = res ? `${res.status}` : 'network_err'
                stats.errorDist = stats.errorDist ?? {}
                stats.errorDist[key] = (stats.errorDist[key] ?? 0) + 1
            }
        }
    }
    await Promise.all(Array.from({ length: concurrency }, worker))
    return { stats, elapsed: Date.now() - start }
}

async function waitRateLimit(label = '') {
    process.stdout.write(`  rate limit 리셋 대기 (61초)${label ? ' — ' + label : ''}...`)
    await new Promise((r) => setTimeout(r, 61_000))
    process.stdout.write(' 완료\n')
}

// ─── 사전 준비 ────────────────────────────────────────────────────────────────

console.log('━'.repeat(60))
console.log('사전 준비 — resolvePool 용 URL 9개 생성')
console.log('━'.repeat(60))

const resolvePool = []
for (let i = 0; i < 9; i++) {
    const res  = await fetch(`${API}/api/shorten`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: `https://stress-pool.com/${Date.now()}-${i}` }),
    })
    const body = await res.json()
    assert.equal(res.status, 201, `resolvePool URL 생성 실패 (${res.status}): ${JSON.stringify(body)}`)
    resolvePool.push(body.shortCode)
}
console.log(`  생성 완료: ${resolvePool.length}개\n`)

// ─── Phase 1: 램프업 부하 테스트 ─────────────────────────────────────────────

console.log('━'.repeat(60))
console.log('Phase 1 — 램프업 부하 테스트 (동시 50 → 200 → 500 → 1000)')
console.log('━'.repeat(60))

for (const concurrency of [50, 200, 500, 1000]) {
    const fetchFn = () => {
        const code = resolvePool[Math.floor(Math.random() * resolvePool.length)]
        return timedFetch(`${API}/api/resolve/${code}`, { redirect: 'manual' })
    }
    const { stats, elapsed } = await runLoad(fetchFn, concurrency, 8_000)
    const { errRate } = printStats(`동시 ${concurrency}`, stats, elapsed)
    assert.ok(errRate <= ERR_THRESHOLD, `동시 ${concurrency}: 에러율 ${errRate}% > 허용 ${ERR_THRESHOLD}%`)
}
console.log('  ✅ Phase 1 통과\n')

// ─── Phase 2: clickLimit 대량 동시 접근 ──────────────────────────────────────

console.log('━'.repeat(60))
console.log('Phase 2 — clickLimit 대량 동시 접근 (limit=50, 요청=500)')
console.log('━'.repeat(60))

await waitRateLimit('Phase 1 이후')

const p2Res  = await fetch(`${API}/api/shorten`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: `https://stress-test-p2.com/${Date.now()}`, clickLimit: 50 }),
})
const p2Body = await p2Res.json()
assert.equal(p2Res.status, 201, `Phase 2 URL 생성 실패 (${p2Res.status}): ${JSON.stringify(p2Body)}`)
console.log(`  shortCode: ${p2Body.shortCode} (clickLimit: 50)`)

const p2Results  = await Promise.allSettled(
    Array.from({ length: 500 }, () =>
        fetch(`${API}/api/resolve/${p2Body.shortCode}`, { redirect: 'manual' }).then((r) => r.status)
    )
)
const p2Statuses = p2Results.filter((r) => r.status === 'fulfilled').map((r) => r.value)
const p2Ok       = p2Statuses.filter((s) => s === 200).length
const p2Over     = p2Statuses.filter((s) => s === 410).length
const p2Dist     = p2Statuses.reduce((acc, s) => { acc[s] = (acc[s] ?? 0) + 1; return acc }, {})

console.log(`  상태코드 분포: ${JSON.stringify(p2Dist)}`)
console.log(`  200 (허용): ${p2Ok}  (기대: 50)`)
console.log(`  410 (초과): ${p2Over}  (기대: 450)`)

assert.equal(p2Ok,   50,  '정확히 50개만 통과해야 함')
assert.equal(p2Over, 450, '나머지 450개는 410이어야 함')
console.log('  ✅ Phase 2 통과\n')

// ─── Phase 3: BullMQ 큐 적체 ─────────────────────────────────────────────────

console.log('━'.repeat(60))
console.log('Phase 3 — BullMQ 큐 적체 (3초간 500 동시 resolve → Worker 처리 확인)')
console.log('━'.repeat(60))

const p3FetchFn = () => timedFetch(`${API}/api/resolve/${resolvePool[0]}`, { redirect: 'manual' })
const { stats: p3Stats, elapsed: p3Elapsed } = await runLoad(p3FetchFn, 500, 3_000)
printStats('큐 적체 주입', p3Stats, p3Elapsed)

console.log('  Worker 처리 대기 (5초)...')
await new Promise((r) => setTimeout(r, 5_000))

await waitRateLimit('Phase 3 이후')

const p3Check = await fetch(`${API}/api/resolve/${resolvePool[0]}`, { redirect: 'manual' })
assert.equal(p3Check.status, 200, 'Worker 처리 후에도 URL이 살아있어야 함 (clickLimit 없음)')
console.log('  ✅ Phase 3 통과\n')

// ─── Phase 4: 혼합 시나리오 ──────────────────────────────────────────────────

console.log('━'.repeat(60))
console.log('Phase 4 — 혼합 시나리오 (생성 20% / 조회 70% / 만료 URL 10%) 30초')
console.log('━'.repeat(60))

// 만료 URL 미리 준비
const p4ExpRes  = await fetch(`${API}/api/shorten`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        url: `https://stress-test-p4-expired.com/${Date.now()}`,
        expiresAt: new Date(Date.now() + 500).toISOString(),
    }),
})
const p4ExpBody = await p4ExpRes.json()
assert.equal(p4ExpRes.status, 201, `Phase 4 만료 URL 생성 실패: ${JSON.stringify(p4ExpBody)}`)
await new Promise((r) => setTimeout(r, 1_000)) // 만료 대기

let mixIdx = 0
const mixedStats = { create: makeStats(), resolve: makeStats(), expired: makeStats() }

async function mixedWorker() {
    const start = Date.now()
    while (Date.now() - start < 30_000) {
        const roll = Math.random()
        if (roll < 0.20) {
            // 생성 (20%)
            const { res, latency } = await timedFetch(`${API}/api/shorten`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: `https://stress-mixed.com/${Date.now()}-${mixIdx++}` }),
            })
            const s = mixedStats.create
            s.total++; s.latencies.push(latency)
            res && res.status === 201 ? s.success++ : s.error++
        } else if (roll < 0.90) {
            // 조회 (70%)
            const code = resolvePool[Math.floor(Math.random() * resolvePool.length)]
            const { res, latency } = await timedFetch(`${API}/api/resolve/${code}`, { redirect: 'manual' })
            const s = mixedStats.resolve
            s.total++; s.latencies.push(latency)
            res && res.status === 200 ? s.success++ : s.error++
        } else {
            // 만료 URL 조회 (10%)
            const { res, latency } = await timedFetch(`${API}/api/resolve/${p4ExpBody.shortCode}`, { redirect: 'manual' })
            const s = mixedStats.expired
            s.total++; s.latencies.push(latency)
            res && (res.status === 410 || res.status === 404) ? s.success++ : s.error++
        }
    }
}

await Promise.all(Array.from({ length: 200 }, mixedWorker))

printStats('생성 (20%)',          mixedStats.create,  30_000)
printStats('조회 (70%)',          mixedStats.resolve, 30_000)
printStats('만료 URL 조회 (10%)', mixedStats.expired, 30_000)

const createErr  = mixedStats.create.total  ? (mixedStats.create.error  / mixedStats.create.total)  * 100 : 0
const resolveErr = mixedStats.resolve.total ? (mixedStats.resolve.error / mixedStats.resolve.total) * 100 : 0
const expiredErr = mixedStats.expired.total ? (mixedStats.expired.error / mixedStats.expired.total) * 100 : 0

assert.ok(createErr  <= 50,            `생성 에러율 ${createErr.toFixed(2)}% 초과`)
assert.ok(resolveErr <= ERR_THRESHOLD, `조회 에러율 ${resolveErr.toFixed(2)}% > ${ERR_THRESHOLD}%`)
assert.ok(expiredErr <= ERR_THRESHOLD, `만료 URL 에러율 ${expiredErr.toFixed(2)}% > ${ERR_THRESHOLD}%`)
console.log('  ✅ Phase 4 통과\n')

// ─── 최종 요약 ────────────────────────────────────────────────────────────────

console.log('━'.repeat(60))
console.log('✅ 스트레스 테스트 전 구간 통과')
console.log('━'.repeat(60))
