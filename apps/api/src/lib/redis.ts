import IORedis from 'ioredis'

// BullMQ는 lazyConnect + maxRetriesPerRequest: null 조합을 권장함
export const redisConnection = new IORedis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    maxRetriesPerRequest: null, // BullMQ 필수 옵션
})

redisConnection.on('connect', () => console.log('[Redis] connected'))
redisConnection.on('error', (err) => console.error('[Redis] error', err))
