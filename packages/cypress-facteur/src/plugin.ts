import { Facteur, FacteurTimeout } from '@facteur-eu/sdk'
import type { Inbox, Message, WaitCriteria } from '@facteur-eu/sdk'
import type { TimedOut } from './failure.js'
import { TASKS } from './tasks.js'

/**
 * The half of the plugin that runs in Node. Cypress runs a test inside the browser, and a key has no business
 * there: the browser half reaches the client through `cy.task`, so the key stays in this process.
 *
 *     import { defineConfig } from 'cypress'
 *     import { facteurTasks } from 'cypress-facteur/plugin'
 *
 *     export default defineConfig({
 *         e2e: { setupNodeEvents: (on, config) => facteurTasks(on, config) },
 *     })
 */

export { TASKS }

export type WaitTaskArguments = { tag: string; criteria?: WaitCriteria; timeout?: number }
export type WaitTaskAnswer = { message: Message } | { timedOut: TimedOut }

/**
 * Registers the tasks and returns the config with the key taken out of it.
 *
 * The key is read from the process environment (`FACTEUR_API_KEY`) or from `config.env`, kept in this closure, and deleted
 * from the config that goes back to Cypress. Since Cypress 16, `cy.env()` also serves what `CYPRESS_*` variables and `--env` hold,
 * out of this config's reach: the README says to use the plain variable. What the browser gets instead, in `config.expose` (public by design: `Cypress.expose()`), is `FACTEUR_RUN`: one value for the whole run,
 * which the tags are built with.
 *
 * The inbox is opened by the first task that needs it, not here: `setupNodeEvents` runs for `cypress open` too, and a
 * run that sends no mail must not open an inbox, or fail on a missing key.
 */
export function facteurTasks(on: Cypress.PluginEvents, config: Cypress.PluginConfigOptions): Cypress.PluginConfigOptions {
    const env = (name: string): string | undefined => {
        const value = config.env?.[name] ?? process.env[name]
        return typeof value === 'string' && value !== '' ? value : undefined
    }
    const apiKey = env('FACTEUR_API_KEY')
    const baseUrl = env('FACTEUR_BASE_URL')
    const named = env('FACTEUR_INBOX')
    const workspace = env('FACTEUR_WORKSPACE')
    const runId = (typeof config.expose?.FACTEUR_RUN === 'string' ? config.expose.FACTEUR_RUN : undefined) ?? process.env.FACTEUR_RUN ?? Date.now().toString(36)

    if (config.env) delete config.env.FACTEUR_API_KEY
    config.expose = { ...config.expose, FACTEUR_RUN: runId }

    let client: Facteur | null = null
    let opened: Promise<Inbox> | null = null
    let created = false

    const facteur = (): Facteur => (client ??= new Facteur({ apiKey, baseUrl, maxConcurrentWaits: 2 }))

    const inbox = (): Promise<Inbox> => {
        opened ??= (async () => {
            if (named) {
                const found = (await facteur().inboxes.list()).find((one) => one.id === named)
                if (!found) {
                    throw new Error(`FACTEUR_INBOX names ${named}, which this key does not reach. Check the id on the inbox screen, or widen the key's workspaces.`)
                }
                return found
            }
            const made = await facteur().inboxes.create({ name: `cypress ${runId}`, workspace })
            created = true
            return made
        })()
        // A failed opening is not kept: the next task tries again.
        opened.catch(() => (opened = null))
        return opened
    }

    on('task', {
        async [TASKS.inbox]() {
            const one = await inbox()
            return { id: one.id as string, domain: (one.domain as string | undefined) ?? null }
        },

        // A rejected task shows in Cypress as an error from the plugin process, which reads as a bug of the package and
        // not as a missing mail. The timeout comes back as a value, and the command writes the failure.
        async [TASKS.waitFor]({ tag, criteria = {}, timeout }: WaitTaskArguments): Promise<WaitTaskAnswer> {
            const one = await inbox()
            try {
                // `+<tag>@` and not the bare tag: a tag that is the start of another tag does not match it.
                // The search carries the bodies and the headers, as the read of one message does: no second call.
                return { message: await facteur().messages.waitFor({ ...criteria, inbox: one.id as string, sentTo: `+${tag}@`, ...(timeout === undefined ? {} : { wait: timeout }) }) }
            } catch (error) {
                if (!(error instanceof FacteurTimeout)) throw error
                return { timedOut: { criteria, waitedMs: error.waitedMs, address: `...+${tag}@${one.domain ?? 'the inbox domain'}`, arrived: error.arrived } }
            }
        },

        async [TASKS.messages]() {
            const one = await inbox()
            return facteur().inboxes.messages(one.id as string, { limit: 20 })
        },

        // Deletes the inbox, and only one this run opened: a suite that names `FACTEUR_INBOX` keeps its inbox.
        async [TASKS.purge]() {
            if (created && opened) {
                try {
                    await facteur().inboxes.delete((await opened).id as string)
                } catch {
                    // The inbox stays; the next run opens another one.
                }
            }
            created = false
            opened = null
            return null
        },
    })

    return config
}
