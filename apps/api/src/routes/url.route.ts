import {FastifyInstance} from 'fastify'

export const urlRoute = async (app: FastifyInstance) => {
    app.post('/api/shorten', async (request, reply) => {
        return reply.status(201).send({ message: 'ok' }) // TODO
    })

    app.get('/:shortCode', async (request, reply) => {
        return reply.status(302).send()  // TODO
    })
}

// TODO : service/repository 레이어 → PostgreSQL 연결 → BullMQ 비동기 큐 → Cloudflare Worker 순서로 작업 예정