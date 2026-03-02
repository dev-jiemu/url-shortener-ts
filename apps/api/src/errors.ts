export class UrlExpiredError extends Error {
    constructor(shortCode: string) {
        super(`만료된 URL입니다: ${shortCode}`)
        this.name = 'UrlExpiredError'
    }
}

export class UrlNotFoundError extends Error {
    constructor(shortCode: string) {
        super(`존재하지 않는 URL입니다: ${shortCode}`)
        this.name = 'UrlNotFoundError'
    }
}