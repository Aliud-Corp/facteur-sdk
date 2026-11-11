/**
 * The files written for each tool. A template is a function of the inbox id, so the id is spelled in the test:
 * the plugins read the inbox from `FACTEUR_INBOX`, and a test that does not set it falls back on opening an inbox,
 * which a plan with one inbox refuses.
 */
export type Tool = 'playwright' | 'cypress'

export type Template = {
    /** Files to write, relative to the target folder. */
    files: Array<{ path: string; content: (inbox: string) => string }>
    /** Other files that, if present, make the written ones unusable (Cypress refuses two config files). */
    conflicts: string[]
    /** The line that installs what the written files import. */
    install: string
    /** The line that runs the written test. */
    run: string
}

export const TOOLS: readonly Tool[] = ['playwright', 'cypress']

/** The id of an inbox goes inside a string literal of the generated code: only characters that need no escaping. */
export const INBOX_ID = /^[A-Za-z0-9_-]+$/

const playwrightTest = (inbox: string): string => `import { expect, test } from 'playwright-facteur'

// Written by create-facteur. FACTEUR_INBOX tells the plugin which inbox the tests use; this line gives it
// the inbox you chose when the variable is not set.
process.env.FACTEUR_INBOX ??= '${inbox}'

test('the signup email carries a one-time code', async ({ inbox }) => {
    // An address that belongs to this test alone, in your inbox.
    const address = inbox.address('signup')

    // Replace this line with whatever makes your application send the mail.
    console.log(\`Send your signup email to \${address}\`)

    await expect(inbox).toReceiveEmail({ subject: 'confirmation code' })
    await expect(inbox).toHaveOtp()
})
`

const cypressConfig = (inbox: string): string => `import { defineConfig } from 'cypress'
import { facteurTasks } from 'cypress-facteur/plugin'

// Written by create-facteur. FACTEUR_INBOX tells the plugin which inbox the tests use; this line gives it
// the inbox you chose when the variable is not set.
process.env.FACTEUR_INBOX ??= '${inbox}'

export default defineConfig({
    e2e: {
        setupNodeEvents(on, config) {
            // Return what facteurTasks returns: it is the config without the API key.
            return facteurTasks(on, config)
        },
    },
})
`

const cypressSupport = (): string => `import 'cypress-facteur'
`

const cypressTest = (): string => `// Written by create-facteur.
describe('sign up', () => {
    it('the signup email carries a one-time code', () => {
        // An address that belongs to this test alone, in your inbox.
        cy.facteurAddress('signup').then((address) => {
            // Replace this line with whatever makes your application send the mail.
            cy.log(\`Send your signup email to \${address}\`)
        })

        cy.facteurWaitFor({ subject: 'confirmation code' }).then((message) => {
            expect(message.otp).to.match(/^[0-9]{4,10}$/)
        })
    })
})
`

export const TEMPLATES: Record<Tool, Template> = {
    playwright: {
        files: [{ path: 'tests/signup.spec.ts', content: playwrightTest }],
        conflicts: [],
        install: 'npm i -D playwright-facteur @playwright/test',
        run: 'npx playwright test',
    },
    cypress: {
        files: [
            { path: 'cypress.config.mjs', content: cypressConfig },
            { path: 'cypress/support/e2e.js', content: cypressSupport },
            { path: 'cypress/e2e/signup.cy.js', content: cypressTest },
        ],
        conflicts: ['cypress.config.js', 'cypress.config.ts', 'cypress.config.cjs'],
        install: 'npm i -D cypress-facteur cypress',
        run: 'npx cypress run',
    },
}
