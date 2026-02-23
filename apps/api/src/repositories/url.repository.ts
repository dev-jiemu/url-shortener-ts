import { PrismaClient, Url } from '@prisma/client'
import { ShortenOptions } from '../services/url.service'

export class UrlRepository {
    constructor(private readonly db: PrismaClient) {}

    async findByShortCode(shortCode: string): Promise<Url | null> {
        return this.db.url.findUnique({ where: { shortCode } })
    }

    async findByOriginalUrl(originalUrl: string): Promise<Url | null> {
        return this.db.url.findFirst({ where: { originalUrl } })
    }

    async create(originalUrl: string, shortCode: string, options: ShortenOptions = {}): Promise<Url> {
        return this.db.url.create({
            data: {
                originalUrl,
                shortCode,
                expiresAt: options.expiresAt ?? null,
                clickLimit: options.clickLimit ?? null,
            },
        })
    }
}
