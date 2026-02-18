import Fastify from 'fastify'
import {urlRoute} from './routes/url.route'

const app = Fastify({
    logger: true
})

const start = async () => {
    try {
        await app.listen({
            port: 8080, // TODO : process.env
            host: '127.0.0.1',
        })

    } catch (err) {
        app.log.error(err)
        process.exit(1)
    }
}

app.register(urlRoute)

start()