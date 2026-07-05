import { redisConnection } from '../lib/redis'
import { UrlClickedEvent } from '@url-shortener/types'

const STREAM = 'url:clicked'
const GROUP = 'stats'
const CONSUMER = 'stats-1'

function parseEvent(fields: string[]): UrlClickedEvent {
    const obj: Record<string, string> = {}
    for (let i = 0; i < fields.length; i += 2) {
        obj[fields[i]] = fields[i + 1]
    }
    return obj as unknown as UrlClickedEvent
}

async function ensureGroup() {
    try {
        await redisConnection.xgroup('CREATE', STREAM, GROUP, '$', 'MKSTREAM')
        console.log(`[stats] consumer group '${GROUP}' 생성됨`)
    } catch (err: any) {
        if (!err.message?.includes('BUSYGROUP')) throw err
    }
}

async function processEvent(id: string, event: UrlClickedEvent) {
    // TODO: 통계 집계 로직 추가 예정 (country별 클릭 수, 시간대별 분포 등)
    console.log(`[stats] 이벤트 수신 — shortCode: ${event.shortCode}, country: ${event.country ?? '-'}, at: ${event.clickedAt}`)
    await redisConnection.xack(STREAM, GROUP, id)
}

async function runLoop() {
    console.log('[stats] consumer started')

    while (true) {
        try {
            const results = await redisConnection.xreadgroup(
                'GROUP', GROUP, CONSUMER,
                'COUNT', '10',
                'BLOCK', '5000',
                'STREAMS', STREAM, '>'
            ) as [string, [string, string[]][]][] | null

            if (!results) continue

            for (const [, messages] of results) {
                for (const [id, fields] of messages) {
                    try {
                        const event = parseEvent(fields)
                        await processEvent(id, event)
                    } catch (err: any) {
                        console.error(`[stats] 메시지 처리 실패 (id: ${id}):`, err.message)
                    }
                }
            }
        } catch (err: any) {
            console.error('[stats] loop 에러:', err.message)
            await new Promise(resolve => setTimeout(resolve, 1000))
        }
    }
}

export async function startStatsConsumer() {
    await ensureGroup()
    runLoop()
}
