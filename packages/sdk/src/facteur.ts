import { createClient, createConfig } from './generated/client/index.js'
import type { Client } from './generated/client/index.js'
import {
    createExtractor,
    createInbox,
    deleteExtractor,
    deleteInbox,
    downloadAttachment,
    getMessage,
    getWorkspace,
    listExtractors,
    listInboxes,
    listInboxMessages,
    listWorkspaceInboxes,
    listWorkspaces,
    searchMessages,
    suggestExtractors,
    tryExtractor,
    updateInbox,
} from './generated/sdk.gen.js'
import type {
    Extractor,
    ExtractorCreateExtractorRequest,
    ExtractorSuggestions,
    ExtractorSuggestionsSuggestExtractorsRequest,
    ExtractorTrial,
    ExtractorTrialTryExtractorRequest,
    Inbox,
    InboxCreateInboxRequest,
    InboxUpdateInboxRequestJsonMergePatch,
    Message,
    MessagePage,
    Workspace,
} from './generated/types.gen.js'
import { addressFor } from './address.js'
import { FacteurError, FacteurTimeout, codeOf, explain } from './errors.js'
import type { SearchCriteria, WaitCriteria } from './errors.js'
import { retrying, sleep } from './transport.js'

/** Where the API answers, unless a caller says otherwise. The generated client carries no address. */
const DEFAULT_BASE_URL = 'https://api.facteur.eu'

/** How long `waitFor` waits by default: the length of a signup journey. */
const DEFAULT_WAIT_MS = 30_000

/**
 * How often `waitFor` searches again. The API answers every search at once and holds nothing open: the
 * wait is this loop. A mail is almost always analysed within a second of its arrival.
 */
const DEFAULT_POLL_INTERVAL_MS = 1_000

/**
 * What `waitFor` reads as "now" when the caller gives no `since`: one minute earlier. It keeps the mail of an
 * earlier run out, and it absorbs a clock of this machine that runs ahead of the server's.
 */
const SINCE_MARGIN_MS = 60_000

/** What `waitFor` waits on a 429 that carries no `Retry-After`. */
const RATE_LIMITED_PAUSE_MS = 1_000

export type FacteurOptions = {
    /** Defaults to `FACTEUR_API_KEY`. */
    apiKey?: string
    /** Defaults to `FACTEUR_BASE_URL`, then to the production API. */
    baseUrl?: string
    /** A replacement for the global `fetch`, for tests. */
    fetch?: typeof fetch
    /** The limit of one request. Default 30000. */
    timeoutMs?: number
    /** How often `waitFor` searches again, in milliseconds. Default 1000. */
    pollIntervalMs?: number
    /** What `waitFor` sleeps with, for tests. */
    sleep?: (ms: number) => Promise<void>
}

/** The criteria `waitFor` takes: those of a search, plus how long to wait at most (milliseconds, 30000 by default). */
export type WaitForCriteria = WaitCriteria & { timeout?: number }

export type CreateInboxInput = InboxCreateInboxRequest & {
    /** The slug of the workspace. Without it, the default workspace is looked up (needs `org:read`). */
    workspace?: string
}

type CallResult<T> = { data?: T; error?: unknown; response?: Response }

export class Facteur {
    readonly inboxes: {
        list: () => Promise<Inbox[]>
        create: (input: CreateInboxInput) => Promise<Inbox>
        update: (id: string, patch: InboxUpdateInboxRequestJsonMergePatch) => Promise<Inbox>
        delete: (id: string) => Promise<void>
        messages: (id: string, page?: { limit?: number; cursor?: string }) => Promise<MessagePage>
    }
    readonly messages: {
        search: (criteria: SearchCriteria) => Promise<MessagePage>
        waitFor: (criteria: WaitForCriteria) => Promise<Message>
        get: (id: string) => Promise<Message>
    }
    readonly attachments: { download: (id: string) => Promise<ArrayBuffer> }
    /** Pointers saved on an inbox. `test` and `suggest` call the API's `trials` and `suggestions` routes. */
    readonly extractors: {
        list: (inbox: string) => Promise<Extractor[]>
        create: (inbox: string, extractor: ExtractorCreateExtractorRequest) => Promise<Extractor>
        delete: (inbox: string, id: string) => Promise<void>
        test: (inbox: string, body: ExtractorTrialTryExtractorRequest) => Promise<ExtractorTrial>
        suggest: (inbox: string, body: ExtractorSuggestionsSuggestExtractorsRequest) => Promise<ExtractorSuggestions>
    }
    /** Reading the workspaces the key reaches. Listing needs `org:read`. */
    readonly workspaces: {
        list: () => Promise<Workspace[]>
        get: (slug: string) => Promise<Workspace>
        inboxes: (slug: string) => Promise<Inbox[]>
    }

    readonly #client: Client
    readonly #timeoutMs: number
    readonly #pollIntervalMs: number
    readonly #sleep: (ms: number) => Promise<void>
    #defaultWorkspace: string | null = null

    constructor(options: FacteurOptions = {}) {
        const apiKey = options.apiKey ?? process.env.FACTEUR_API_KEY
        if (!apiKey) {
            throw new TypeError(
                'No API key. Pass `apiKey`, or set FACTEUR_API_KEY. Create the key in the application, under Settings, API keys.',
            )
        }
        this.#timeoutMs = options.timeoutMs ?? 30_000
        this.#pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
        this.#sleep = options.sleep ?? sleep
        // The key goes in the `Authorization` header (the generated operations declare a bearer
        // scheme), never in the address.
        this.#client = createClient(
            createConfig({
                baseUrl: (options.baseUrl ?? process.env.FACTEUR_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, ''),
                fetch: retrying(options.fetch ?? globalThis.fetch, this.#sleep),
                auth: apiKey,
                throwOnError: false,
            }),
        )

        this.inboxes = {
            list: async () => (await this.#call('/inboxes', listInboxes({ client: this.#client, signal: this.#signal() }))) ?? [],
            create: (input) => this.#createInbox(input),
            update: async (id, patch) =>
                this.#call('/inboxes/{inboxId}', updateInbox({ client: this.#client, path: { inboxId: id }, body: patch, signal: this.#signal() })),
            delete: async (id) => {
                await this.#call('/inboxes/{inboxId}', deleteInbox({ client: this.#client, path: { inboxId: id }, signal: this.#signal() }))
            },
            messages: (id, page) => this.#inboxMessages(id, page),
        }

        this.messages = {
            search: (criteria) => this.#search(criteria),
            waitFor: (criteria) => this.#waitFor(criteria),
            get: (id) =>
                this.#call('/messages/{messageId}', getMessage({ client: this.#client, path: { messageId: id }, signal: this.#signal() })),
        }

        this.attachments = {
            download: async (id) => {
                const file = await this.#call(
                    '/attachments/{attachmentId}',
                    downloadAttachment({ client: this.#client, path: { attachmentId: id }, parseAs: 'blob', signal: this.#signal() }),
                )
                return file.arrayBuffer()
            },
        }

        this.extractors = {
            list: async (inbox) =>
                (await this.#call('/inboxes/{inboxId}/extractors', listExtractors({ client: this.#client, path: { inboxId: inbox }, signal: this.#signal() }))) ?? [],
            create: (inbox, extractor) =>
                this.#call('/inboxes/{inboxId}/extractors', createExtractor({ client: this.#client, path: { inboxId: inbox }, body: extractor, signal: this.#signal() })),
            delete: async (inbox, id) => {
                await this.#call(
                    '/inboxes/{inboxId}/extractors/{extractorId}',
                    deleteExtractor({ client: this.#client, path: { inboxId: inbox, extractorId: id }, signal: this.#signal() }),
                )
            },
            test: (inbox, body) =>
                this.#call('/inboxes/{inboxId}/extractors/trials', tryExtractor({ client: this.#client, path: { inboxId: inbox }, body, signal: this.#signal() })),
            suggest: (inbox, body) =>
                this.#call(
                    '/inboxes/{inboxId}/extractors/suggestions',
                    suggestExtractors({ client: this.#client, path: { inboxId: inbox }, body, signal: this.#signal() }),
                ),
        }

        this.workspaces = {
            list: async () => (await this.#call('/workspaces', listWorkspaces({ client: this.#client, signal: this.#signal() }))) ?? [],
            get: (slug) => this.#call('/workspaces/{slug}', getWorkspace({ client: this.#client, path: { slug }, signal: this.#signal() })),
            inboxes: async (slug) =>
                (await this.#call('/workspaces/{slug}/inboxes', listWorkspaceInboxes({ client: this.#client, path: { slug }, signal: this.#signal() }))) ?? [],
        }
    }

    /** The same function as the export, reachable from the client. */
    addressFor(...args: Parameters<typeof addressFor>): string {
        return addressFor(...args)
    }

    #signal(): AbortSignal {
        return AbortSignal.timeout(this.#timeoutMs)
    }

    /** Unwraps a generated call: the data, or a `FacteurError` built from the problem body. */
    async #call<T>(path: string, pending: Promise<CallResult<T>>): Promise<T> {
        const result = await pending
        if (!result.response) throw result.error
        if (result.response.ok) return result.data as T

        const body = result.error
        const code = codeOf(body)
        throw new FacteurError(explain(code, result.response.status, path), { code, status: result.response.status, body })
    }

    #inboxMessages(id: string, page?: { limit?: number; cursor?: string }): Promise<MessagePage> {
        return this.#call(
            '/inboxes/{inboxId}/messages',
            listInboxMessages({ client: this.#client, path: { inboxId: id }, query: page, signal: this.#signal() }),
        )
    }

    /**
     * An inbox lives in a workspace, so one has to be named. Without a name, the default workspace is
     * looked up once and remembered.
     */
    async #createInbox({ workspace, ...body }: CreateInboxInput): Promise<Inbox> {
        const slug = workspace ?? (await this.#resolveDefaultWorkspace())
        return this.#call('/workspaces/{slug}/inboxes', createInbox({ client: this.#client, path: { slug }, body, signal: this.#signal() }))
    }

    /**
     * Listing the workspaces needs `org:read`, which a key made for a test suite usually does not
     * hold. The convenience is then unavailable, and the error says how to do without it instead of
     * passing on a permission error about a route the caller never asked for.
     */
    async #resolveDefaultWorkspace(): Promise<string> {
        if (this.#defaultWorkspace) return this.#defaultWorkspace

        let workspaces
        try {
            workspaces = await this.#call('/workspaces', listWorkspaces({ client: this.#client, signal: this.#signal() }))
        } catch (error) {
            if (error instanceof FacteurError && error.code === 'API_KEY_PERMISSION_MISSING') {
                throw new FacteurError(
                    'Pass `workspace` to inboxes.create(). Finding the default workspace needs the org:read permission, which a key made for a test suite does not hold. Name the workspace (its slug is on the workspace screen), or add org:read to the key.',
                    { code: 'WORKSPACE_NOT_RESOLVABLE', status: error.status, body: error.body },
                )
            }
            throw error
        }

        const chosen = workspaces.find((one) => one.isDefault) ?? workspaces[0]
        if (!chosen?.slug) {
            throw new FacteurError('This key reaches no workspace, so there is nowhere to open an inbox. Widen its permissions, or name a workspace.', {
                code: 'NO_WORKSPACE_IN_REACH',
            })
        }
        this.#defaultWorkspace = chosen.slug
        return chosen.slug
    }

    /** One search: the API answers at once with what matches now. */
    #search(criteria: SearchCriteria): Promise<MessagePage> {
        return this.#call<MessagePage>('/messages', searchMessages({ client: this.#client, query: criteria, signal: this.#signal() }))
    }

    /**
     * Waits for one message and returns the newest match: it searches, and searches again every
     * `pollIntervalMs` until a message matches or `timeout` runs out, with one last search at the end. The
     * API holds nothing open. It rejects when none comes: a list would force every caller to rewrite the same
     * assertion, and the suite that forgets goes green on a mail that never arrived. The rejection says what
     * arrived instead, read from the inbox listing.
     *
     * A 429 is the limit of the key (600 calls a minute), which a suite with many workers on one key can
     * reach: it slows the wait down instead of ending it, until the timeout.
     */
    async #waitFor(criteria: WaitForCriteria): Promise<Message> {
        const started = Date.now()
        const { timeout = DEFAULT_WAIT_MS, ...rest } = criteria
        const deadline = started + timeout
        const searched: WaitCriteria = { ...rest, since: rest.since ?? new Date(started - SINCE_MARGIN_MS).toISOString() }

        for (;;) {
            let pause = this.#pollIntervalMs
            try {
                const first = (await this.#search(searched)).messages?.[0]
                if (first) return first
            } catch (error) {
                if (!(error instanceof FacteurError && error.code === 'RATE_LIMITED')) throw error
                pause = Math.max(pause, retryAfterOf(error) ?? RATE_LIMITED_PAUSE_MS)
            }
            const left = deadline - Date.now()
            if (left <= 0) break
            await this.#sleep(Math.min(pause, left))
        }

        const waitedMs = Date.now() - started
        const arrived = await this.#whatArrivedInstead(searched)
        throw new FacteurTimeout(
            [
                `No message matched after ${Math.round(waitedMs / 1000)}s.`,
                `Searched: ${JSON.stringify(searched)}.`,
                arrived.length
                    ? `What did arrive: ${arrived.map(describe).join('; ')}.`
                    : 'Nothing could be read in that inbox: nothing arrived in that window, or the criteria name no inbox.',
            ].join(' '),
            { criteria: searched, waitedMs, arrived },
        )
    }

    /**
     * The five last messages of the inbox, for the timeout message. A search cannot ask for
     * "everything in this inbox" (`CRITERIA_EMPTY`), so this reads the inbox listing. It forgives its
     * own failure: an error raised from the error path would replace a useful timeout with a
     * confusing one.
     */
    async #whatArrivedInstead(criteria: WaitCriteria): Promise<Message[]> {
        if (!criteria.inbox) return []
        try {
            const page = await this.#inboxMessages(criteria.inbox, { limit: 5 })
            return (page.messages ?? []).slice(0, 5)
        } catch {
            return []
        }
    }
}

/** The `Retry-After` of a refusal, in milliseconds, when its answer said one. */
function retryAfterOf(error: FacteurError): number | null {
    const body = error.body as { retryAfter?: unknown } | null
    return typeof body?.retryAfter === 'number' ? body.retryAfter * 1000 : null
}

/** One line about a message that is not the one being waited for. */
function describe(message: Message): string {
    const to = message.toAddress ?? 'unknown recipient'
    const subject = message.subject ? `"${message.subject}"` : 'no subject'
    return `${to}, ${subject} (${message.status ?? 'unknown status'})`
}
