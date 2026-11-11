import { Facteur, addressFor } from '@facteur-eu/sdk'
import type { Inbox, Message, MessagePage, WaitCriteria } from '@facteur-eu/sdk'
import { test as base } from '@playwright/test'
import type { TestInfo } from '@playwright/test'
import { reportAttachments } from './report.js'
import { tagFor } from './tag.js'
import { boundedWait } from './wait.js'

/**
 * What `toReceiveEmail` and `inbox.waitFor` accept: the criteria of a search, without the inbox and the
 * address, which are the test's own, plus a ceiling for this wait.
 */
export type ReceiveCriteria = Omit<WaitCriteria, 'inbox' | 'sentTo'> & {
    /** Milliseconds to wait at most. Never more than what is left of the test's own timeout. */
    timeout?: number
}

/** What a test holds: the shared inbox, seen through an address that belongs to this test alone. */
export type TestInbox = {
    readonly id: string
    readonly domain: string
    /** The part after the `+` of this test's address. */
    readonly tag: string
    /** The last message `waitFor` returned in this test, or null. */
    readonly latest: Message | null
    /** This test's address: send the mail under test here. */
    address: (local?: string) => string
    /** Waits for a message sent to this test's address, attaches it to the report, and returns it. */
    waitFor: (criteria?: ReceiveCriteria) => Promise<Message>
    /** The last messages of the whole inbox, whatever their address (to see what else arrived). */
    messages: () => Promise<MessagePage>
}

type TestFixtures = { inbox: TestInbox }
type WorkerFixtures = { facteur: Facteur; facteurInbox: Inbox }

/**
 * One value for the whole run. The runner loads the test files before it starts the workers, which
 * inherit its environment: the first load sets the variable and every worker reads the same one. A
 * worker that finds it empty (a runner that did not load this module) falls back to its own start.
 */
const runId = (process.env.FACTEUR_RUN ??= Date.now().toString(36))

export const test = base.extend<TestFixtures, WorkerFixtures>({
    // The client, one per worker: it holds the queue of waits, which is per process.
    facteur: [
        // Playwright reads the fixtures a function needs from its first parameter, which must be a destructuring.
        // eslint-disable-next-line no-empty-pattern
        async ({}, use, workerInfo) => {
            // The API refuses past twenty open waits per organization, shared by every process that uses
            // the organization's keys: a worker keeps a share of sixteen, at least one.
            const share = Math.max(1, Math.floor(16 / Math.max(1, workerInfo.config.workers)))
            await use(new Facteur({ maxConcurrentWaits: share }))
        },
        { scope: 'worker' },
    ],

    // The inbox of the worker. `FACTEUR_INBOX` names an existing one, which is what a plan with a single inbox needs.
    // Without it, the worker opens an inbox (in `FACTEUR_WORKSPACE`, or the default workspace) and deletes it at the end.
    facteurInbox: [
        async ({ facteur }, use, workerInfo) => {
            const existing = process.env.FACTEUR_INBOX
            if (existing) {
                const found = (await facteur.inboxes.list()).find((one) => one.id === existing)
                if (!found) {
                    throw new Error(`FACTEUR_INBOX names ${existing}, which this key does not reach. Check the id on the inbox screen, or widen the key's workspaces.`)
                }
                await use(found)
                return
            }

            const opened = await facteur.inboxes.create({
                name: `playwright ${runId} w${workerInfo.workerIndex}`,
                workspace: process.env.FACTEUR_WORKSPACE,
            })
            try {
                await use(opened)
            } finally {
                await facteur.inboxes.delete(opened.id as string).catch(() => undefined)
            }
        },
        { scope: 'worker' },
    ],

    inbox: async ({ facteur, facteurInbox }, use, testInfo) => {
        const tag = tagFor({ titlePath: testInfo.titlePath, title: testInfo.title, parallelIndex: testInfo.parallelIndex, retry: testInfo.retry, runId })
        const startedAt = Date.now()
        const inboxId = facteurInbox.id as string
        let latest: Message | null = null

        await use({
            id: inboxId,
            domain: facteurInbox.domain as string,
            tag,
            get latest() {
                return latest
            },
            address: (local = 'test') => addressFor(facteurInbox, tag, { local }),
            async waitFor(criteria = {}) {
                const { timeout, ...search } = criteria
                const wait = boundedWait(testInfo, startedAt, timeout)
                // `+<tag>@` and not the bare tag: a tag that is the start of another tag does not match it.
                const found = await facteur.messages.waitFor({ ...search, inbox: inboxId, sentTo: `+${tag}@`, wait })
                // The search carries the bodies and the headers, as the read of one message does: no second call.
                latest = found
                await attach(testInfo, found)
                return found
            },
            messages: () => facteur.inboxes.messages(inboxId, { limit: 20 }),
        })
    },
})

/** The message, in the report: its JSON and the source of its HTML body, never a rendered page (see `reportAttachments`). */
async function attach(testInfo: TestInfo, message: Message): Promise<void> {
    for (const { name, contentType, body } of reportAttachments(message)) {
        await testInfo.attach(name, { contentType, body })
    }
}
