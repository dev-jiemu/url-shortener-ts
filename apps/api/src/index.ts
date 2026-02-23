import Fastify from 'fastify'
import { urlRoute } from './routes/url.route'
import { startClickWorker } from './workers/click.worker'
import { startExpireWorker } from './workers/expire.worker'

const app = Fastify({ logger: true })

const start = async () => {
    try {
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