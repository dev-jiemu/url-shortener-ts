import { UrlRepository } from '../repositories/url.repository'
import { clickQueue, expireQueue } from '../queues'

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const SHORT_CODE_LENGTH = 7

function generateShortCode(): string {
    let code = ''
    for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
        code += BASE62[Math.floor(Math.random() * BASE62.length)]
    }
    return code
}

export interface ShortenOptions {
    expiresAt?: Date    // TTL 기반 만료 시각
    clickLimit?: number // 횟수 기반 만료
}

export class UrlService {
    constructor(private readonly urlRepo: UrlRepository) {}

    async shorten(
        originalUrl: string,
        options: ShortenOptions = {}
    ): Promise<{ shortCode: string; originalUrl: string }> {
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
                const created = await this.urlRepo.create(originalUrl, shortCode, options)

                // TTL이 있으면 expire-queue에 delayed job 등록
                if (options.expiresAt) {
                    const delay = options.expiresAt.getTime() - Date.now()
                    if (delay > 0) {
                        await expireQueue.add(
                            'expire',
                            { shortCode },
                            { delay, jobId: `expire:${shortCode}` } // jobId로 중복 방지
                        )
                    }
                }

                return { shortCode: created.shortCode, originalUrl: created.originalUrl }
            }
        }

        throw new Error('shortCode 생성 실패 — 재시도 초과')
    }

    async resolve(shortCode: string): Promise<string | null> {
        const url = await this.urlRepo.findByShortCode(shortCode)
        if (!url) return null

        // 만료 체크 (TTL)
        if (url.expiresAt && url.expiresAt < new Date()) return null

        // 클릭 이벤트를 큐에 비동기로 던짐 — 응답 지연 없음
        await clickQueue.add('click', { shortCode })

        return url.originalUrl
    }
}
