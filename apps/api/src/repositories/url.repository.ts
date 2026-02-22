import { PrismaClient, Url } from '@prisma/client'

export class UrlRepository {
    constructor(private readonly db: PrismaClient) {}

    async findByShortCode(shortCode: string): Promise<Url | null> {
        return this.db.url.findUnique({ where: { shortCode } })
    }

    async findByOriginalUrl(originalUrl: string): Promise<Url | null> {
        return this.db.url.findFirst({ where: { originalUrl } })
    }

    async create(originalUrl: string, shortCode: string): Promise<Url> {
        return this.db.url.create({ data: { originalUrl, shortCode } })
    }
}
