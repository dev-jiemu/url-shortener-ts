import { Queue } from 'bullmq'
import { redisConnection } from '../lib/redis'

// click-queue는 Phase 1에서 Redis Streams(url:clicked)로 대체됨 — 더 이상 사용하지 않음
// (컨슈머 이전은 다음 단계에서 진행)

// expire-queue: TTL 기반 delayed job으로 만료 시각에 삭제 실행
export const expireQueue = new Queue('expire-queue', {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 200 },
    },
})
