import type { Message, Problem, SearchMessagesData } from './generated/types.gen.js'

/** The codes the SDK raises itself, when no answer of the API says what went wrong. */
export type SdkErrorCode = 'MESSAGE_NOT_RECEIVED' | 'WORKSPACE_NOT_RESOLVABLE' | 'NO_WORKSPACE_IN_REACH'

export type FacteurErrorCode = Problem['code'] | SdkErrorCode

/**
 * A refusal from the API, carrying the code to branch on.
 *
 * `code` is the contract. `message` is the SDK's own sentence, and `body` keeps the raw answer
 * (`application/problem+json`, with its English `detail`) for whoever wants it anyway.
 */
export class FacteurError extends Error {
    readonly code: FacteurErrorCode | null
    readonly status: number | null
    readonly body: unknown

    constructor(
        message: string,
        details: { code?: FacteurErrorCode | null; status?: number | null; body?: unknown } = {},
    ) {
        super(message)
        this.name = 'FacteurError'
        this.code = details.code ?? null
        this.status = details.status ?? null
        this.body = details.body ?? null
    }
}

/** The criteria of a search, without the plumbing (`wait`, `limit`, `cursor`). */
export type WaitCriteria = Omit<SearchCriteria, 'wait' | 'limit' | 'cursor'>

/**
 * `waitFor` ran out of time. It has its own class because a suite handles it differently from the
 * rest: the mail did not arrive (a product failure), where every other error is an integration one.
 */
export class FacteurTimeout extends FacteurError {
    readonly criteria: WaitCriteria
    readonly waitedMs: number
    /** What did land in the inbox instead, newest first (at most five). Empty when it could not be read. */
    readonly arrived: Message[]

    constructor(message: string, details: { criteria: WaitCriteria; waitedMs: number; arrived: Message[] }) {
        super(message, { code: 'MESSAGE_NOT_RECEIVED' })
        this.name = 'FacteurTimeout'
        this.criteria = details.criteria
        this.waitedMs = details.waitedMs
        this.arrived = details.arrived
    }
}

export type SearchCriteria = NonNullable<SearchMessagesData['query']>

/**
 * What each refusal means, in the words of somebody reading a red pipeline.
 *
 * The table is typed on `Problem['code']` (doctrine 5.7): a code removed from the registry stops
 * compiling here, and no code is retyped as a free string. A code that is not listed falls back to
 * the route and the status.
 */
const PHRASES: Partial<Record<Problem['code'], string>> = {
    UNAUTHENTICATED: 'No API key reached the API. Pass `apiKey` or set FACTEUR_API_KEY.',
    API_KEY_UNKNOWN: 'The API key is unknown. Check that it was copied whole, and that it comes from this Facteur.',
    API_KEY_EXPIRED: 'The API key has expired. Create a new one in the application.',
    API_KEY_REVOKED: 'The API key was revoked. Create a new one in the application.',
    API_KEY_PERMISSION_MISSING:
        'The key does not hold the permission this call needs, and the answer body names it. A key made for a test suite reads and writes mail, and does not read the organization (org:read).',
    TOO_MANY_WAITS:
        'The organization already holds twenty open waits, usually a suite that fires searches without awaiting them. Lower the worker count, or lower `maxConcurrentWaits` on the client.',
    RATE_LIMITED: 'The key made more calls than it may in a minute. The client retries; this call still failed after its retries.',
    CRITERIA_UNKNOWN:
        'A search criterion does not exist. An unknown criterion is refused instead of ignored, which stops a typo from matching every message.',
    CRITERIA_EMPTY: 'A search with no criterion is not a search. To read the last messages, list the inbox instead (inboxes.messages).',
    CRITERIA_INVALID:
        'A search criterion has a value the API cannot use: a value that is too long (the answer body gives the longest allowed), a `limit` that is not a whole number, a date that is not a date, or a boolean written otherwise than true or false. The answer body says which.',
    INBOX_NOT_FOUND: 'No such inbox, or none this key reaches. The answer is the same on purpose.',
    MESSAGE_NOT_FOUND: 'No such message, or one in a workspace this key does not reach.',
    WORKSPACE_NOT_FOUND: 'No such workspace, or none this key reaches.',
    ATTACHMENT_NOT_FOUND: 'No such attachment, or one this key does not reach.',
    ATTACHMENT_NOT_STORED:
        'The attachment was described but never kept. Read `reason` on the message that listed it: performance mode, size or storage quota.',
    ATTACHMENT_STORE_UNAVAILABLE: 'The store of the attachments did not answer, even after the retries. Try again later.',
    API_DRAINING: 'The API instance was stopping, even after the retries. Try again in a moment.',
    INBOX_LIMIT_REACHED: 'The plan holds no more inboxes. Delete one, or change plan.',
    WORKSPACE_LIMIT_REACHED: 'The plan holds no more workspaces.',
}

/** The sentence for a refusal. */
export function explain(code: FacteurErrorCode | null, status: number, path: string): string {
    const known = code ? (PHRASES as Partial<Record<string, string>>)[code] : undefined
    if (known) return known
    if (status === 401) return 'The key is unknown, revoked or expired.'
    return `${path} answered ${status}${code ? ` (${code})` : ''}.`
}

/** The `code` of an `application/problem+json` body, or null when the body is anything else. */
export function codeOf(body: unknown): Problem['code'] | null {
    if (typeof body === 'object' && body !== null && 'code' in body && typeof body.code === 'string') {
        return body.code as Problem['code']
    }
    return null
}
