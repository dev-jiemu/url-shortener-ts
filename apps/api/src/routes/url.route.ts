import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma'
import { UrlRepository } from '../repositories/url.repository'
import { UrlService } from '../services/url.service'
import { UrlExpiredError, UrlNotFoundError } from "../errors";

const urlRepo = new UrlRepository(prisma)
const urlService = new UrlService(urlRepo)

export const urlRoute = async (app: FastifyInstance) => {
    // POST /api/shorten — long URL -> short URL 변환
    // 생성 요청은 엄격하게 -> IP당 10회/분
    app.post<{ Body:
            {
                url: string,
                expiresAt?: string
                clickLimit?: number
            } }>('/api/shorten', {
        config: {
            rateLimit: {
                max: 10,
                timeWindow: '1 minute',
            },
        },
    }, async (request, reply) => {
        const { url, expiresAt, clickLimit } = request.body

        if (!url) {
            return reply.status(400).send({ message: 'url은 필수입니다.' })
        }

        const result = await urlService.shorten(url, {
            expiresAt: expiresAt ? new Date(expiresAt) : undefined,
            clickLimit: clickLimit ?? undefined
        })
        return reply.status(201).send(result)
    })

    // GET /:shortCode — short URL -> original URL 리다이렉트 (브라우저 직접 접근용)
    app.get<{ Params: { shortCode: string } }>('/:shortCode', async (request, reply) => {
        const { shortCode } = request.params

        try {
            const originalUrl = await urlService.resolve(shortCode)
            return reply.redirect(originalUrl, 302)
        } catch (e) {
            if (e instanceof UrlExpiredError) {
                return reply.status(410).send({ message: '만료된 URL입니다.' })
            }
            if (e instanceof UrlNotFoundError) {
                return reply.status(404).send({ message: '존재하지 않는 URL입니다.' })
            }
            return reply.status(500).send({ message: '서버 에러' })
        }
    })

    // GET /api/resolve/:shortCode — Cloudflare Worker 전용
    // 302 리다이렉트 대신 originalUrl 을 JSON 으로 반환
    // Worker 가 직접 리다이렉트 응답을 만들기 위해 사용
    app.get<{ Params: { shortCode: string } }>('/api/resolve/:shortCode', async (request, reply) => {
        const { shortCode } = request.params

        try {
            const originalUrl = await urlService.resolve(shortCode)
            return reply.status(200).send({ originalUrl })
        } catch (e) {
            if (e instanceof UrlExpiredError) {
                return reply.status(410).send({ message: '만료된 URL입니다.' })
            }
            if (e instanceof UrlNotFoundError) {
                return reply.status(404).send({ message: '존재하지 않는 URL입니다.' })
            }
            return reply.status(500).send({ message: '서버 에러' })
        }
    })
}
