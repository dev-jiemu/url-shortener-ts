import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma'
import { UrlRepository } from '../repositories/url.repository'
import { UrlService } from '../services/url.service'

const urlRepo = new UrlRepository(prisma)
const urlService = new UrlService(urlRepo)

export const urlRoute = async (app: FastifyInstance) => {
    // POST /api/shorten — long URL -> short URL 변환
    app.post<{ Body: { url: string } }>('/api/shorten', async (request, reply) => {
        const { url } = request.body

        if (!url) {
            return reply.status(400).send({ message: 'url은 필수입니다.' })
        }

        const result = await urlService.shorten(url)
        return reply.status(201).send(result)
    })

    // GET /:shortCode — short URL -> original URL 리다이렉트
    app.get<{ Params: { shortCode: string } }>('/:shortCode', async (request, reply) => {
        const { shortCode } = request.params

        const originalUrl = await urlService.resolve(shortCode)
        if (!originalUrl) {
            return reply.status(404).send({ message: '존재하지 않는 URL입니다.' })
        }

        return reply.status(302).redirect(originalUrl)
    })
}
