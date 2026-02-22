import { UrlRepository } from '../repositories/url.repository'

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const SHORT_CODE_LENGTH = 7

function generateShortCode(): string {
    let code = ''
    for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
        code += BASE62[Math.floor(Math.random() * BASE62.length)]
    }
    return code
}

export class UrlService {
    constructor(private readonly urlRepo: UrlRepository) {}

    async shorten(originalUrl: string): Promise<{ shortCode: string; originalUrl: string }> {
        // 이미 단축된 URL이 있으면 재사용
        const existing = await this.urlRepo.findByOriginalUrl(originalUrl)
        if (existing) {
            return { shortCode: existing.shortCode, originalUrl: existing.originalUrl }
        }

        // shortCode 충돌 방지 — 최대 5회 재시도
        for (let attempt = 0; attempt < 5; attempt++) {
            const shortCode = generateShortCode()
            const conflict = await this.urlRepo.findByShortCode(shortCode)
            if (!conflict) {
                const created = await this.urlRepo.create(originalUrl, shortCode)
                return { shortCode: created.shortCode, originalUrl: created.originalUrl }
            }
        }

        throw new Error('shortCode 생성 실패 — 재시도 초과')
    }

    async resolve(shortCode: string): Promise<string | null> {
        const url = await this.urlRepo.findByShortCode(shortCode)
        return url ? url.originalUrl : null
    }
}
