// The project of a customer who installed `cypress-facteur`, played in a sandbox by
// the maintainers' end-to-end spec, against a running stack. It reads its stack from the
// environment: FACTEUR_API_KEY (not CYPRESS_FACTEUR_API_KEY: since Cypress 16, a CYPRESS_ variable is readable by a spec through
// `cy.env()`, and the point of the package is that the browser side never holds the key), FACTEUR_BASE_URL and FACTEUR_INBOX.
import { defineConfig } from 'cypress'
import { facteurTasks } from 'cypress-facteur/plugin'
import { sendTo } from './cypress/support/mail.mjs'

export default defineConfig({
    video: false,
    screenshotOnRunFailure: false,
    e2e: {
        specPattern: 'cypress/e2e/*.cy.js',
        supportFile: 'cypress/support/e2e.js',
        defaultCommandTimeout: 30_000,
        setupNodeEvents(on, config) {
            const key = process.env.FACTEUR_API_KEY
            const configured = facteurTasks(on, config)
            on('task', {
                // The mail under test is sent by the project's own means, over SMTP, to the address of the test.
                async sendMail({ to, ...fields }) {
                    await sendTo(to, fields)
                    return null
                },
                // The browser sends what it can see; the key stays here, in Node. `decoy` proves the scan reaches what it claims to.
                probe({ seen, decoy }) {
                    const where = (needle) => Object.keys(seen).filter((name) => needle && seen[name].includes(needle))
                    return { keyIn: key ? where(key) : null, decoyIn: where(decoy) }
                },
            })
            return configured
        },
    },
})
