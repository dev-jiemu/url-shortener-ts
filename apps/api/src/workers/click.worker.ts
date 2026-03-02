import { Worker, Job } from 'bullmq'
import { redisConnection } from '../lib/redis'
import { prisma } from '../lib/prisma'

export interface ClickJobData {
    shortCode: string
}

export function startClickWorker() {
    const worker = new Worker<ClickJobData>(
        'click-queue',
        async (job: Job<ClickJobData>) => {
            const { shortCode } = job.data

            // clickCount를 원자적으로 증가시키고 최신 값을 반환
            const updated = await prisma.url.update({
                where: { shortCode },
                data: { clickCount: { increment: 1 } },
                select: { clickCount: true, clickLimit: true, expiresAt: true }, // RETURNING click_count, click_limit, expires_at
            })

            // clickLimit 초과 체크
            if (updated.clickLimit !== null && updated.clickCount >= updated.clickLimit) {
                await prisma.url.delete({ where: { shortCode } })
                console.log(`[click-worker] ${shortCode} — clickLimit 초과로 삭제`)
            }
        },
        { // worker 설정 옵션 객체
            connection: redisConnection,
            concurrency: 20, // 동시에 처리할 job 수 (대용량 처리 핵심)
        }
    )

    worker.on('failed', (job, err) => {
        console.error(`[click-worker] job ${job?.id} 실패:`, err.message)
    })

    console.log('[click-worker] started')
    return worker
}
