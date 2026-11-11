import { afterEach, describe, expect, it, vi } from 'vitest'
import { Facteur, FacteurError, FacteurTimeout, addressFor } from './index.js'
import type { Problem } from './index.js'

type Responder = (request: Request) => Response | Promise<Response>

/** A `fetch` that records every request and answers with the responders in turn (the last repeats). */
function fakeFetch(...responders: Responder[]) {
    const requests: Request[] = []
    const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init)
        requests.push(request)
        const responder = responders[Math.min(requests.length - 1, responders.length - 1)]
        return responder(request)
    })
    return { fetch: fn as unknown as typeof fetch, requests, calls: fn }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

const problem = (code: Problem['code'], status: number, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify({ code, detail: 'English prose', status, title: 'x', type: `/errors/${code}` }), {
        status,
        headers: { 'content-type': 'application/problem+json', ...headers },
    })

const client = (fetch: typeof globalThis.fetch, extra: Record<string, unknown> = {}) =>
    new Facteur({ apiKey: 'fk_secret', baseUrl: 'https://api.test', fetch, ...extra })

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
})

describe('requests', () => {
    it('searches with a GET of /messages, the criteria as query parameters, the key in the Authorization header and never in the address', async () => {
        const fake = fakeFetch(() => json({ messages: [{ id: 'm1' }], nextCursor: null }))
        const page = await client(fake.fetch).messages.search({ inbox: 'ib1', subject: 'Welcome' })

        expect(page.messages?.[0]?.id).toBe('m1')
        const request = fake.requests[0]
        expect(request.method).toBe('GET')
        expect(new URL(request.url).pathname).toBe('/messages')
        expect(request.headers.get('authorization')).toBe('Bearer fk_secret')
        expect(request.url).not.toContain('fk_secret')
        expect(Object.fromEntries(new URL(request.url).searchParams)).toEqual({ inbox: 'ib1', subject: 'Welcome' })
        expect(request.body).toBeNull()
    })

    it('writes booleans as true or false and numbers as digits, the only spellings the API accepts', async () => {
        const fake = fakeFetch(() => json({ messages: [] }))
        await client(fake.fetch).messages.search({ inbox: 'ib1', hasOtp: true, hasAttachment: false, limit: 10, wait: 2000, type: 'sms' })

        expect(Object.fromEntries(new URL(fake.requests[0].url).searchParams)).toEqual({
            inbox: 'ib1',
            hasOtp: 'true',
            hasAttachment: 'false',
            limit: '10',
            wait: '2000',
            type: 'sms',
        })
    })

    it('encodes the text of a criterion in the address, and sends nothing else', async () => {
        const fake = fakeFetch(() => json({ messages: [] }))
        await client(fake.fetch).messages.search({ subject: 'Code & 100% sûr', sentTo: 'a+b@x.test' })

        const url = new URL(fake.requests[0].url)
        expect(url.searchParams.get('subject')).toBe('Code & 100% sûr')
        expect(url.searchParams.get('sentTo')).toBe('a+b@x.test')
        expect(url.search).not.toContain(' ')
    })

    it('sends no request without a key', () => {
        vi.stubEnv('FACTEUR_API_KEY', '')
        const fake = fakeFetch(() => json({}))
        expect(() => new Facteur({ fetch: fake.fetch })).toThrow(TypeError)
        expect(fake.calls).not.toHaveBeenCalled()
    })

    it('reads the key and the address from the environment', async () => {
        vi.stubEnv('FACTEUR_API_KEY', 'fk_env')
        vi.stubEnv('FACTEUR_BASE_URL', 'https://elsewhere.test/')
        const fake = fakeFetch(() => json([]))
        await new Facteur({ fetch: fake.fetch }).inboxes.list()

        expect(fake.requests[0].url).toBe('https://elsewhere.test/inboxes')
        expect(fake.requests[0].headers.get('authorization')).toBe('Bearer fk_env')
    })

    it('patches an inbox as application/merge-patch+json', async () => {
        const fake = fakeFetch(() => json({ id: 'ib1' }))
        await client(fake.fetch).inboxes.update('ib1', { name: 'renamed' })

        expect(fake.requests[0].method).toBe('PATCH')
        expect(fake.requests[0].headers.get('content-type')).toBe('application/merge-patch+json')
    })

    it('downloads an attachment as bytes', async () => {
        const fake = fakeFetch(() => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'application/pdf' } }))
        const bytes = await client(fake.fetch).attachments.download('a1')

        expect(new URL(fake.requests[0].url).pathname).toBe('/attachments/a1')
        expect([...new Uint8Array(bytes)]).toEqual([1, 2, 3])
    })
})

describe('waitFor', () => {
    it('returns the newest message and sends the wait to the server', async () => {
        const fake = fakeFetch(() => json({ messages: [{ id: 'newest' }, { id: 'older' }] }))
        const message = await client(fake.fetch).messages.waitFor({ inbox: 'ib1', subject: 'Code' })

        expect(message.id).toBe('newest')
        expect(Object.fromEntries(new URL(fake.requests[0].url).searchParams)).toEqual({ inbox: 'ib1', subject: 'Code', wait: '30000' })
    })

    it('rejects with a FacteurTimeout that lists what arrived instead, read from the inbox listing', async () => {
        const fake = fakeFetch(
            () => json({ messages: [] }),
            () => json({ messages: [{ id: 'm9', toAddress: 'other@x.test', subject: 'Hello', status: 'parsed' }] }),
        )
        const error = await client(fake.fetch)
            .messages.waitFor({ inbox: 'ib1', subject: 'Code', wait: 1 })
            .catch((caught: unknown) => caught)

        expect(error).toBeInstanceOf(FacteurTimeout)
        const timeout = error as FacteurTimeout
        expect(timeout.code).toBe('MESSAGE_NOT_RECEIVED')
        expect(timeout.criteria).toEqual({ inbox: 'ib1', subject: 'Code' })
        expect(timeout.arrived.map((one) => one.id)).toEqual(['m9'])
        expect(timeout.message).toContain('other@x.test')
        expect(fake.requests[1].method).toBe('GET')
        expect(new URL(fake.requests[1].url).pathname).toBe('/inboxes/ib1/messages')
    })

    it('keeps the timeout when the diagnostic itself fails', async () => {
        const fake = fakeFetch(() => json({ messages: [] }), () => problem('INTERNAL_ERROR', 500))
        const error = await client(fake.fetch)
            .messages.waitFor({ inbox: 'ib1', subject: 'Code', wait: 1 })
            .catch((caught: unknown) => caught)

        expect(error).toBeInstanceOf(FacteurTimeout)
        expect((error as FacteurTimeout).arrived).toEqual([])
    })

    it('holds the 9th wait until one of the 8 ends', async () => {
        const open: Array<(response: Response) => void> = []
        const fake = fakeFetch(() => new Promise<Response>((resolve) => open.push(resolve)))
        const facteur = client(fake.fetch)

        const waits = Array.from({ length: 9 }, (_, index) => facteur.messages.waitFor({ inbox: `ib${index}`, wait: 10 }))
        await tick()
        expect(fake.calls).toHaveBeenCalledTimes(8)

        open[0](json({ messages: [{ id: 'first' }] }))
        await tick()
        expect(fake.calls).toHaveBeenCalledTimes(9)

        open.slice(1).forEach((resolve) => resolve(json({ messages: [{ id: 'later' }] })))
        await expect(Promise.all(waits)).resolves.toHaveLength(9)
    })
})

describe('retries', () => {
    it('waits for Retry-After on a 429, then asks again', async () => {
        vi.useFakeTimers()
        const fake = fakeFetch(() => problem('RATE_LIMITED', 429, { 'retry-after': '2' }), () => json([]))
        const pending = client(fake.fetch).inboxes.list()

        await vi.advanceTimersByTimeAsync(1999)
        expect(fake.calls).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(1)
        await expect(pending).resolves.toEqual([])
        expect(fake.calls).toHaveBeenCalledTimes(2)
    })

    it.each(['API_DRAINING', 'ATTACHMENT_STORE_UNAVAILABLE'] as const)('retries a 503 %s', async (code) => {
        const fake = fakeFetch(() => problem(code, 503, { 'retry-after': '0' }), () => json({ id: 'm1' }))
        const message = await client(fake.fetch).messages.get('m1')

        expect(message.id).toBe('m1')
        expect(fake.calls).toHaveBeenCalledTimes(2)
    })

    it('does not retry a 503 that is not documented as retryable', async () => {
        const fake = fakeFetch(() => problem('SERVICE_UNAVAILABLE', 503))
        await expect(client(fake.fetch).messages.get('m1')).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE', status: 503 })
        expect(fake.calls).toHaveBeenCalledTimes(1)
    })

    it('names the route of a search when its refusal has no sentence of its own, and explains a value that is too long', async () => {
        const fake = fakeFetch(() => problem('INTERNAL_ERROR', 500), () => problem('CRITERIA_INVALID', 400))
        const unlisted = (await client(fake.fetch, { retries: 0 }).messages.search({ inbox: 'ib1' }).catch((caught: unknown) => caught)) as FacteurError
        expect(unlisted.message).toBe('/messages answered 500 (INTERNAL_ERROR).')

        const tooLong = (await client(fake.fetch).messages.search({ subject: 'a'.repeat(300) }).catch((caught: unknown) => caught)) as FacteurError
        expect(tooLong.code).toBe('CRITERIA_INVALID')
        expect(tooLong.message).toContain('too long')
    })

    it('does not retry CRITERIA_UNKNOWN', async () => {
        const fake = fakeFetch(() => problem('CRITERIA_UNKNOWN', 400))
        await expect(client(fake.fetch).messages.search({ inbox: 'ib1' })).rejects.toMatchObject({
            code: 'CRITERIA_UNKNOWN',
            status: 400,
        })
        expect(fake.calls).toHaveBeenCalledTimes(1)
    })
})

describe('refusals', () => {
    it('explains a refusal in the SDK words and keeps the code read from the problem body', async () => {
        const fake = fakeFetch(() => problem('API_KEY_PERMISSION_MISSING', 403))
        const error = await client(fake.fetch).inboxes.list().catch((caught: unknown) => caught)

        expect(error).toBeInstanceOf(FacteurError)
        const refusal = error as FacteurError
        expect(refusal.code).toBe('API_KEY_PERMISSION_MISSING')
        expect(refusal.status).toBe(403)
        expect(refusal.message).toContain('org:read')
        expect(refusal.message).not.toContain('English prose')
        expect(refusal.body).toMatchObject({ code: 'API_KEY_PERMISSION_MISSING' })
    })

    it('tells a key without org:read to name the workspace', async () => {
        const fake = fakeFetch(() => problem('API_KEY_PERMISSION_MISSING', 403))
        const error = await client(fake.fetch).inboxes.create({ name: 'signup' }).catch((caught: unknown) => caught)

        expect(error).toMatchObject({ code: 'WORKSPACE_NOT_RESOLVABLE', status: 403 })
        expect((error as FacteurError).message).toContain('Pass `workspace`')
        expect(fake.calls).toHaveBeenCalledTimes(1)
    })

    it('creates the inbox in the default workspace, looked up once', async () => {
        const fake = fakeFetch(
            () => json([{ slug: 'other', isDefault: false }, { slug: 'main', isDefault: true }]),
            () => json({ id: 'ib1' }),
            () => json({ id: 'ib2' }),
        )
        const facteur = client(fake.fetch)
        await facteur.inboxes.create({ name: 'one' })
        await facteur.inboxes.create({ name: 'two' })

        expect(fake.requests.map((request) => new URL(request.url).pathname)).toEqual([
            '/workspaces',
            '/workspaces/main/inboxes',
            '/workspaces/main/inboxes',
        ])
    })
})

describe('workspaces and extractors', () => {
    it('reads the workspaces with GETs of /workspaces, /workspaces/{slug} and /workspaces/{slug}/inboxes', async () => {
        const fake = fakeFetch(
            () => json([{ slug: 'main' }]),
            () => json({ slug: 'main', name: 'Main' }),
            () => json([{ id: 'ib1' }]),
        )
        const facteur = client(fake.fetch)

        expect(await facteur.workspaces.list()).toEqual([{ slug: 'main' }])
        expect(await facteur.workspaces.get('main')).toEqual({ slug: 'main', name: 'Main' })
        expect(await facteur.workspaces.inboxes('main')).toEqual([{ id: 'ib1' }])

        expect(fake.requests.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
            'GET /workspaces',
            'GET /workspaces/main',
            'GET /workspaces/main/inboxes',
        ])
    })

    it('lists, creates and deletes the extractors of an inbox', async () => {
        const fake = fakeFetch(
            () => json([{ id: 'x1', key: 'code' }]),
            () => json({ id: 'x2', key: 'code' }, 201),
            () => new Response(null, { status: 204 }),
        )
        const facteur = client(fake.fetch)

        expect(await facteur.extractors.list('ib1')).toEqual([{ id: 'x1', key: 'code' }])
        expect(await facteur.extractors.create('ib1', { key: 'code', pattern: '(\\d{6})', scope: 'text' })).toEqual({ id: 'x2', key: 'code' })
        expect(await facteur.extractors.delete('ib1', 'x2')).toBeUndefined()

        expect(fake.requests.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
            'GET /inboxes/ib1/extractors',
            'POST /inboxes/ib1/extractors',
            'DELETE /inboxes/ib1/extractors/x2',
        ])
        expect(await fake.requests[1].json()).toEqual({ key: 'code', pattern: '(\\d{6})', scope: 'text' })
    })

    it('tests a pattern on the trials route and asks for suggestions on the suggestions route', async () => {
        const fake = fakeFetch(
            () => json({ valid: true, matchedMessages: 1 }),
            () => json({ candidates: [] }),
        )
        const facteur = client(fake.fetch)

        expect(await facteur.extractors.test('ib1', { pattern: '(\\d+)', scope: 'text' })).toEqual({ valid: true, matchedMessages: 1 })
        await facteur.extractors.suggest('ib1', { source: 'Code 123456', selection: '123456', offset: 5 })

        expect(fake.requests.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
            'POST /inboxes/ib1/extractors/trials',
            'POST /inboxes/ib1/extractors/suggestions',
        ])
        expect(await fake.requests[0].json()).toEqual({ pattern: '(\\d+)', scope: 'text' })
        expect(await fake.requests[1].json()).toMatchObject({ selection: '123456' })
    })

    it('raises a FacteurError on a refusal', async () => {
        const fake = fakeFetch(() => problem('API_KEY_PERMISSION_MISSING', 403))
        await expect(client(fake.fetch).workspaces.list()).rejects.toMatchObject({ code: 'API_KEY_PERMISSION_MISSING', status: 403 })
    })
})

describe('addressFor', () => {
    it('builds a tagged address from the inbox domain', () => {
        expect(addressFor({ channel: 'email', domain: 'ab12cd34.inbox.example' }, '3f9a', { local: 'signup' })).toBe(
            'signup+3f9a@ab12cd34.inbox.example',
        )
        expect(addressFor('ab12cd34.inbox.example')).toBe('test@ab12cd34.inbox.example')
    })

    it('refuses an SMS inbox', () => {
        expect(() => addressFor({ channel: 'sms' }, 'x')).toThrow(TypeError)
        expect(() => addressFor({ channel: 'sms', domain: 'd.example' }, 'x')).toThrow(TypeError)
    })
})
