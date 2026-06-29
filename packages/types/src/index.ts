// 이벤트는 "무슨 일이 일어났는가(과거형)" 를 표현 → url.clicked
export interface UrlClickedEvent {
    shortCode: string
    clickedAt: string  // ISO 8601 — Redis Streams(XADD)는 string 필드만 다루므로 string으로 통일
    referer?: string
    ip?: string
    country?: string
}
