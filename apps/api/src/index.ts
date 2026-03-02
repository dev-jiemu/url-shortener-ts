import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { urlRoute } from './routes/url.route'
import { startClickWorker } from './workers/click.worker'
import { startExpireWorker } from './workers/expire.worker'
import { redisConnection } from './lib/redis'

const app = Fastify({
    logger: true,
    // Cloudflare → 백엔드 구조이므로 X-Forwarded-For 헤더를 신뢰해서 실제 클라이언트 IP를 추출
    // 숫자로 지정하면 "앞에서 N번째 프록시까지 신뢰" — Cloudflare 1홉이므로 1
    trustProxy: 1,
})

const start = async () => {
    try {
        // Rate Limit 플러그인 전역 등록
        // 라우트별 override가 없으면 이 기본값이 적용됨
        await app.register(rateLimit, {
            redis: redisConnection,           // Redis store — 멀티 인스턴스 환경에서도 카운트 공유
            nameSpace: 'rl:',                 // Redis 키 prefix (BullMQ 키와 충돌 방지)
            max: 60,                          // 전역 기본값: 60회/분
            timeWindow: '1 minute',
            keyGenerator: (request) => request.ip, // IP 기반 식별
            errorResponseBuilder: (_request, context) => ({
                // 에러 응답 포맷을 다른 에러 응답과 통일
                message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
                retryAfter: Math.ceil(context.ttl / 1000),
            }),
            // fail-open: 오류를 던지지 않고 요청을 통과시킴
            skipOnError: true,
        })

        // Worker 시작 (BullMQ Consumer)
        startClickWorker()
        startExpireWorker()

        await app.listen({
            port: Number(process.env.PORT ?? 8080),
            host: '127.0.0.1',
        })
    } catch (err) {
        app.log.error(err)
        process.exit(1)
    }
}

app.register(urlRoute)

start()
