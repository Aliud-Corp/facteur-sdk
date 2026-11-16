import type { Problem } from './generated/types.gen.js'
import { codeOf } from './errors.js'

/** `Retry-After` in either shape the RFC allows: seconds, or an HTTP date. */
export function retryAfterMs(header: string | null): number | null {
    if (!header) return null
    const seconds = Number(header)
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
    const date = Date.parse(header)
    return Number.isNaN(date) ? null : Math.max(0, date - Date.now())
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const MAX_RETRIES = 3

/** The 503 answer that means "ask again": the attachment store. */
const RETRIED_503: readonly Problem['code'][] = ['ATTACHMENT_STORE_UNAVAILABLE']

/**
 * A `fetch` that retries what the API documents as retryable and nothing else: a 429 (after
 * `Retry-After`) and the 503 answer above. A 4xx about the contract is never retried:
 * `CRITERIA_UNKNOWN` stays wrong however many times it is sent.
 *
 * It receives the `Request` the generated client built, and clones it for each attempt.
 */
export function retrying(base: typeof fetch, pause: (ms: number) => Promise<void> = sleep): typeof fetch {
    return async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init)
        for (let attempt = 0; ; attempt += 1) {
            const response = await base(request.clone())
            if (response.ok || attempt === MAX_RETRIES) return response

            let retryable = response.status === 429
            if (response.status === 503) {
                const code = codeOf(await response.clone().json().catch(() => null))
                retryable = code !== null && RETRIED_503.includes(code)
            }
            if (!retryable) return response

            await pause(retryAfterMs(response.headers.get('retry-after')) ?? 250 * 2 ** attempt)
        }
    }
}
