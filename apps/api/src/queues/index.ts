import { Queue } from 'bullmq'
import { redisConnection } from '../lib/redis'

// click-queue: 클릭 이벤트 집계 + clickLimit 초과 체크
export const clickQueue = new Queue('click-queue', {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,                          // 실패 시 최대 3회 재시도
        backoff: { type: 'exponential', delay: 1000 }, // 1s → 2s → 4s
        removeOnComplete: { count: 1000 },   // 완료된 job 최근 1000개만 보관
        removeOnFail: { count: 500 },
    },
})

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
