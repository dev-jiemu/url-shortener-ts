import { Worker, Job } from 'bullmq'
import { redisConnection } from '../lib/redis'
import { prisma } from '../lib/prisma'

export interface ExpireJobData {
    shortCode: string
}

export function startExpireWorker() {
    const worker = new Worker<ExpireJobData>(
        'expire-queue',
        async (job: Job<ExpireJobData>) => {
            const { shortCode } = job.data

            const url = await prisma.url.findUnique({
                where: { shortCode },
                select: { expiresAt: true },
            })

            // URL이 이미 삭제됐거나 만료일이 없으면 스킵
            if (!url || !url.expiresAt) return

            // 만료 시각이 아직 안 됐으면 스킵 (재스케줄 안 해도 됨 — delayed job이 정확히 맞춰 실행됨)
            if (url.expiresAt > new Date()) return

            await prisma.url.delete({ where: { shortCode } })
            console.log(`[expire-worker] ${shortCode} — TTL 만료로 삭제`)
        },
        {
            connection: redisConnection,
            concurrency: 5, // expire는 DB 삭제 작업이므로 보수적으로 설정
        }
    )

    worker.on('failed', (job, err) => {
        console.error(`[expire-worker] job ${job?.id} 실패:`, err.message)
    })

    console.log('[expire-worker] started')
    return worker
}
