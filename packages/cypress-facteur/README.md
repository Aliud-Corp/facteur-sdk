# cypress-facteur

Receive email in your Cypress tests. Your application sends a mail to an address of a Facteur inbox, and the test waits for it and reads it. The API key stays in Node: the browser, where Cypress runs your tests, never holds it.

Needs `cypress` 16.1.1 or later, and Node 22 or later. It builds on `@facteur-eu/sdk`.

## Install

```sh
npm install --save-dev cypress-facteur cypress
```

Create an API key in the application, under Settings, API keys. A key that reads and writes mail (`ws:read` and `ws:write`) is enough. Keep it, and the inbox your tests use, in the environment:

```sh
export FACTEUR_API_KEY=fk_...
export FACTEUR_INBOX=<the id of the inbox>
```

Do not name the key `CYPRESS_FACTEUR_API_KEY`, and do not put it in `env` or `--env`: since Cypress 16, a spec can read those with `cy.env()`, which puts the key back in the browser. A plain `FACTEUR_API_KEY` stays in Node, where the plugin reads it. Without `FACTEUR_INBOX`, the plugin opens an inbox when the first test needs one (in `FACTEUR_WORKSPACE`, or in the default workspace if the key may read the organization). `cy.facteurPurge()` deletes an inbox the plugin opened and keeps one you named.

## Set it up

Register the plugin in `cypress.config.js`, and import the commands in `cypress/support/e2e.js`.

```js
// cypress.config.js
import { defineConfig } from 'cypress'
import { facteurTasks } from 'cypress-facteur/plugin'

export default defineConfig({
    e2e: {
        setupNodeEvents(on, config) {
            return facteurTasks(on, config)
        },
    },
})
```

```js
// cypress/support/e2e.js
import 'cypress-facteur'
```

Return what `facteurTasks` returns: it is the config without the key.

## Write a test

```js
describe('sign up', () => {
    it('confirms the account with the code in the mail', () => {
        cy.visit('/signup')
        cy.facteurAddress('signup').then((address) => cy.get('input[name=email]').type(address))
        cy.contains('button', 'Create account').click()

        cy.facteurWaitFor({ subject: 'confirmation code' }).then((message) => {
            cy.get('input[name=code]').type(message.otp)
        })
    })
})
```

`cy.facteurAddress('signup')` yields an address that belongs to this test alone, such as `signup+confirms-the-account-with-1x2y3z-r0-m3k9q@<id>.inbox.facteur.eu`. Your application can send to any address of the inbox without creating anything first, so tests share one inbox and never read each other's mail.

## Commands

| Command | Yields |
| --- | --- |
| `cy.facteurAddress(local?)` | The address of this test. `local` is the text before the `+`, `test` by default. |
| `cy.facteurWaitFor(criteria?)` | The first mail sent to this address that matches. The criteria are the SDK's: `subject`, `body`, `sentFrom`, `otp`, `attachmentName`... plus `timeout` in milliseconds, 30 seconds by default. |
| `cy.facteurMessages()` | The last messages of the whole inbox, whatever their address. |
| `cy.facteurInbox()` | The inbox this run uses: its id and the domain it receives at. |
| `cy.facteurPurge()` | Deletes the inbox the plugin opened. |

When the mail does not come, the failure says what did arrive:

```
No message matched {"subject":"Your invoice"} at ...+<tag>@<id>.inbox.facteur.eu.
Waited 3s. What did arrive: test+<tag>@<id>.inbox.facteur.eu, "Welcome" (parsed).
```

## What isolates one test from another

The tag in the address is built from three things:

- the title of the test and a short hash of its spec file and its full path (the groups and the title), so two tests of one `describe`, or two tests with one title in two files, differ;
- the attempt number, so a test that Cypress retries does not read the mail its first attempt received;
- the run, so a suite that keeps its inbox between runs does not read the mail of the previous run.

The tag is worked out from the running test each time a command asks. It is stored nowhere, because the context object of a `describe` is shared by all its tests.

## Where the key goes

A spec is served to a page, so a key used there is a key in the page. The commands call `cy.task`, which runs in Node, where the plugin holds the client. `facteurTasks` reads the key from the environment of the Node process and keeps it there. If you passed it in `config.env` anyway (older versions of Cypress hand that to the browser as `Cypress.env()`), the config it returns no longer holds it. The browser gets one value only, `FACTEUR_RUN`, which is not a secret.

## Licence

MIT.
