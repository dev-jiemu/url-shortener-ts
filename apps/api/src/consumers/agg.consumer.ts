import { redisConnection } from '../lib/redis'
import { prisma } from '../lib/prisma'
import { UrlClickedEvent } from '@url-shortener/types'

const STREAM = 'url:clicked'
const GROUP = 'agg'
const CONSUMER = 'agg-1'

// Redis Streams 필드 배열 → UrlClickedEvent 객체로 변환
// XREADGROUP 응답은 ['field1', 'value1', 'field2', 'value2', ...] 형태
function parseEvent(fields: string[]): UrlClickedEvent {
    const obj: Record<string, string> = {}
    for (let i = 0; i < fields.length; i += 2) {
        obj[fields[i]] = fields[i + 1]
    }
    return obj as unknown as UrlClickedEvent
}

async function ensureGroup() {
    try {
        // MKSTREAM: 스트림이 없으면 자동 생성, '$' 대신 '0'으로 두면 기존 메시지도 처리
        await redisConnection.xgroup('CREATE', STREAM, GROUP, '$', 'MKSTREAM')
        console.log(`[agg] consumer group '${GROUP}' 생성됨`)
    } catch (err: any) {
        // 이미 존재하면 BUSYGROUP 에러 — 정상
        if (!err.message?.includes('BUSYGROUP')) throw err
    }
}

async function processEvent(id: string, event: UrlClickedEvent) {
    const { shortCode } = event

    // clickCount 원자적 증가 후 clickLimit 초과 여부 확인
    const updated = await prisma.url.update({
        where: { shortCode },
        data: { clickCount: { increment: 1 } },
        select: { clickCount: true, clickLimit: true },
    })

    if (updated.clickLimit !== null && updated.clickCount >= updated.clickLimit) {
        await prisma.url.delete({ where: { shortCode } })
        console.log(`[agg] ${shortCode} — clickLimit 초과로 삭제`)
    }

    // 처리 완료 확인 → 재전송 큐에서 제거
    await redisConnection.xack(STREAM, GROUP, id)
}

async function runLoop() {
    console.log('[agg] consumer started')

    while (true) {
        try {
            // BLOCK 5000: 새 메시지 없으면 5초 대기 후 재시도
            const results = await redisConnection.xreadgroup(
                'GROUP', GROUP, CONSUMER,
                'COUNT', '10',
                'BLOCK', '5000',
                'STREAMS', STREAM, '>'  // '>' = 아직 다른 컨슈머에게 전달 안 된 새 메시지만
            ) as [string, [string, string[]][]][] | null

            if (!results) continue  // BLOCK timeout — 새 메시지 없음

            for (const [, messages] of results) {
                for (const [id, fields] of messages) {
                    try {
                        const event = parseEvent(fields)
                        await processEvent(id, event)
                    } catch (err: any) {
                        // 개별 메시지 실패 → XACK 하지 않고 XPENDING에 남겨 재처리 가능하게
                        console.error(`[agg] 메시지 처리 실패 (id: ${id}):`, err.message)
                    }
                }
            }
        } catch (err: any) {
            console.error('[agg] loop 에러:', err.message)
            await new Promise(resolve => setTimeout(resolve, 1000))  // 1초 후 재시도
        }
    }
}

export async function startAggConsumer() {
    await ensureGroup()
    runLoop()  // 루프는 백그라운드에서 돌아야 하므로 await 안 함
}
