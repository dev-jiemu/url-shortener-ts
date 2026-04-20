import { UrlRepository } from '../repositories/url.repository'
import { clickQueue, expireQueue } from '../queues'
import { UrlExpiredError, UrlNotFoundError } from '../errors'
import { redisConnection } from '../lib/redis'

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

        // race condition 방지
        // 기존 흐름 : 5번 정도 DB Search -> 없으면 Insert
        // for (let attempt = 0; attempt < 5; attempt++) {
        //     const shortCode = generateShortCode()
        //     const conflict = await this.urlRepo.findByShortCode(shortCode)
        //     if (!conflict) {
        //         const created = await this.urlRepo.create(originalUrl, shortCode, options)
        //
        //         // TTL이 있으면 expire-queue에 delayed job 등록
        //         if (options.expiresAt) {
        //             const delay = options.expiresAt.getTime() - Date.now()
        //             if (delay > 0) {
        //                 await expireQueue.add(
        //                     'expire',
        //                     { shortCode },
        //                     { delay, jobId: `expire:${shortCode}` } // jobId로 중복 방지
        //                 )
        //             }
        //         }
        //
        //         return { shortCode: created.shortCode, originalUrl: created.originalUrl }
        //     }
        // }
        // 선 Insert 후 결과보고 판단하기
        for(let attempt = 0; attempt < 5; attempt++) {
            const shortCode = generateShortCode()

            try {
                const created =  await this.urlRepo.create(originalUrl, shortCode, options)
                if (options.expiresAt) {
                    const delay = options.expiresAt.getTime() - Date.now()
                    if (delay > 0) {
                        await expireQueue.add(
                            'expire',
                            { shortCode },
                            { delay, jobId: `expire:${shortCode}` }
                        )
                    }
                }

                return {
                    shortCode: created.shortCode,
                    originalUrl: created.originalUrl,
                }
            } catch (e: any) {
                if (e.code === 'P2002') {
                    const target = e.meta?.target
                    const targetStr = Array.isArray(target) ? target.join(',') : String(target ?? '')

                    // shortCode unique 충돌 → 다른 shortCode로 재시도
                    if (targetStr.includes('short_code')) {
                        continue
                    }
                    // originalUrl unique 충돌 → 동시 요청 중 누군가 먼저 INSERT 성공
                    // → DB에서 찾아서 반환
                    if (targetStr.includes('original_url')) {
                        const existing = await this.urlRepo.findByOriginalUrl(originalUrl)
                        if (existing) {
                            return { shortCode: existing.shortCode, originalUrl: existing.originalUrl }
                        }
                    }
                }
                throw e
            }
        }

        throw new Error('shortCode 생성 실패 — 재시도 초과')
    }

    // 만료, 존재안하는 url 구분이 필요할듯
    async resolve(shortCode: string): Promise<string> {
        const url = await this.urlRepo.findByShortCode(shortCode)

        if (!url) throw new UrlNotFoundError(shortCode)

        // 만료 체크 (TTL)
        if (url.expiresAt && url.expiresAt < new Date()) {
            throw new UrlExpiredError(shortCode)
        }

        // clickLimit 원자적 체크 (Redis INCR)
        if (url.clickLimit !== null) {
            const key = `click:limit:${shortCode}`

            // 키가 없으면 DB clickCount 기준으로 초기화 후 TTL 설정
            // SET key value NX : 키가 없을 때만 세팅
            const initialized = await redisConnection.set(key, url.clickCount, 'NX')
            if (initialized) {
                // 키 유효기간 — 24시간 (expiresAt 있으면 그 시점까지만)
                const ttlSeconds = url.expiresAt
                    ? Math.ceil((url.expiresAt.getTime() - Date.now()) / 1000)
                    : 86400
                if (ttlSeconds > 0) await redisConnection.expire(key, ttlSeconds)
            }

            // 원자적으로 +1 하고 결과 반환
            const current = await redisConnection.incr(key)
            if (current > url.clickLimit) {
                // 초과분은 되돌림 (카운터가 무한히 증가하는 것 방지)
                await redisConnection.decr(key)
                throw new UrlExpiredError(shortCode)
            }
        }

        // 클릭 이벤트를 큐에 비동기로 던짐 — 응답 지연 없음
        await clickQueue.add('click', { shortCode })

        return url.originalUrl
    }
}
