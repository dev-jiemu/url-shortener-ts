export interface Env {
	API_BASE_URL: string
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url)
		const pathname = url.pathname // ex) "/HhSoVOC"

		// 헬스체크 — wrangler dev 로 띄웠을 때 확인용
		if (pathname === '/health') {
			return new Response('ok', { status: 200 })
		}

		// short code 추출 — "/" 제거
		const shortCode = pathname.slice(1)

		// short code 가 없으면 404
		if (!shortCode) {
			return new Response('Not Found', { status: 404 })
		}

		// API 서버에 리다이렉트 URL 조회 요청
		// GET /api/resolve/:shortCode → { originalUrl: string }
		const apiUrl = `${env.API_BASE_URL}/api/resolve/${shortCode}`

		let apiRes: Response
		try {
			apiRes = await fetch(apiUrl, {
				headers: {
					// 실제 클라이언트 IP를 API 서버에 전달 (rate limit 에서 사용)
					'X-Forwarded-For': request.headers.get('CF-Connecting-IP') ?? '',
					'X-Worker-Request': '1', // Worker에서 온 요청임을 표시
				},
			})
		} catch {
			// API 서버 자체가 죽었을 때
			return new Response('Service Unavailable', { status: 503 })
		}

		// 404 / 410 — API 서버 응답을 그대로 전달
		if (apiRes.status === 404 || apiRes.status === 410) {
			const body = await apiRes.text()
			return new Response(body, {
				status: apiRes.status,
				headers: { 'Content-Type': 'application/json' },
			})
		}

		// 200 — { originalUrl } 파싱 후 Worker 가 직접 302 리다이렉트
		if (apiRes.status === 200) {
			const { originalUrl } = await apiRes.json<{ originalUrl: string }>()
			return Response.redirect(originalUrl, 302)
		}

		// 그 외 에러
		return new Response('Internal Server Error', { status: 500 })
	},
}
