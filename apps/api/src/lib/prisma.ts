import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

const globalForPrisma = global as unknown as { prisma: PrismaClient }

function createPrismaClient(): PrismaClient {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
    const client = new PrismaClient({
        adapter,
        log: [
            { emit: 'event', level: 'query' },
            { emit: 'stdout', level: 'error' },
        ],
    })

    if (process.env.NODE_ENV !== 'production') {
        client.$on('query', (e) => {
            console.log(`prisma:query ${e.query}`)
            console.log(`prisma:params ${e.params}`)
            console.log(`prisma:duration ${e.duration}ms`)
        })
    }

    return client
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma
}
