import type { Message, MessagePage } from '@facteur-eu/sdk'
import type { WaitCriteria } from '@facteur-eu/sdk'
import { failureMessage } from './failure.js'
import type { TimedOut } from './failure.js'
import { TASKS } from './tasks.js'
import type { WaitTaskAnswer } from './plugin.js'
import { tagFor } from './tag.js'

/**
 * The browser half: import it once, in `cypress/support/e2e.js`.
 *
 *     import 'cypress-facteur'
 *
 * Every command goes through `cy.task`, which crosses into the Cypress process where `cypress-facteur/plugin` holds
 * the client and the key. Nothing here can read the key, and nothing here may import the SDK.
 */

export type FacteurWaitCriteria = Omit<WaitCriteria, 'inbox' | 'sentTo'> & {
    /** Milliseconds to wait at most. 30 seconds by default. */
    timeout?: number
}

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Cypress {
        interface Chainable {
            /** The address this test receives at: `<local>+<tag>@<inbox domain>`. `local` is `test` by default. */
            facteurAddress(local?: string): Chainable<string>
            /** Waits for a mail sent to this test's address and yields it. Fails with what did arrive when none matches. */
            facteurWaitFor(criteria?: FacteurWaitCriteria): Chainable<Message>
            /** The inbox this run uses: its id and the domain it receives at (`null` for an SMS inbox). */
            facteurInbox(): Chainable<{ id: string; domain: string | null }>
            /** The last messages of the whole inbox, whatever their address. */
            facteurMessages(): Chainable<MessagePage>
            /** Deletes the inbox this run opened. An inbox named by `FACTEUR_INBOX` is kept. */
            facteurPurge(): Chainable<null>
        }
    }
}

const DEFAULT_WAIT_MS = 30_000
/** Left to `cy.task` after the wait, for the round trip and the read of the message. */
const TASK_MARGIN_MS = 20_000

/** Computed from the running test every time it is asked: the same inside one test, another in the next. */
function currentTag(): string {
    const test = Cypress.currentTest
    return tagFor({ file: Cypress.spec?.relative ?? '', titlePath: test.titlePath?.length ? test.titlePath : [test.title], retry: Cypress.currentRetry ?? 0, runId: String(Cypress.expose('FACTEUR_RUN') ?? '') })
}

/** Adds the four commands to Cypress. Runs on import; exported so that a support file can say it out loud. */
export function registerFacteurCommands(): void {
    Cypress.Commands.add('facteurAddress', (local = 'test') =>
        cy.task<{ id: string; domain: string | null }>(TASKS.inbox, null, { log: false }).then((inbox) => {
            if (!inbox.domain) throw new Error('cy.facteurAddress needs an email inbox. An SMS inbox has a number instead.')
            return `${local}+${currentTag()}@${inbox.domain}`
        }),
    )

    Cypress.Commands.add('facteurWaitFor', (criteria = {}) => {
        const { timeout = DEFAULT_WAIT_MS, ...search } = criteria
        return cy.task<WaitTaskAnswer>(TASKS.waitFor, { tag: currentTag(), criteria: search, timeout }, { timeout: timeout + TASK_MARGIN_MS, log: false }).then((answer) => {
            if ('timedOut' in answer) throw new Error(failureMessage(answer.timedOut as TimedOut))
            return answer.message
        })
    })

    Cypress.Commands.add('facteurInbox', () => cy.task<{ id: string; domain: string | null }>(TASKS.inbox, null, { log: false }))

    Cypress.Commands.add('facteurMessages', () => cy.task(TASKS.messages, null, { log: false }))

    Cypress.Commands.add('facteurPurge', () => cy.task(TASKS.purge, null, { log: false }))
}

// Node can import this file too (the pack check imports every package by its exports): only a browser has `Cypress`.
if (typeof Cypress !== 'undefined') registerFacteurCommands()
