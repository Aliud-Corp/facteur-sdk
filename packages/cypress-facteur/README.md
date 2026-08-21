# cypress-facteur

Receive email in your Cypress tests, and assert on what arrived.

```js
it('the verification link activates the account', () => {
  cy.facteurAddress('signup').then((address) => {
    cy.visit('/signup');
    cy.get('[name=email]').type(address);
    cy.contains('button', 'Create my account').click();

    cy.facteurWaitFor().should((message) => {
      expect(message.otp).to.match(/^\d{6}$/);
    });
  });
});
```

No `cy.wait(5000)`, no polling loop, no regular expression pulling a six-digit code out
of an HTML body. The wait happens on the server, and the extraction happens when the mail
is received.

## Install

```sh
npm i -D cypress-facteur
export FACTEUR_API_KEY=fk_...
```

Two lines of setup, because Cypress runs your test **inside the browser** and an API key
has no business there.

`cypress.config.js`, where the key lives:

```js
import { defineConfig } from 'cypress';
import { facteurTasks } from 'cypress-facteur/plugin';

export default defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      return facteurTasks(on, config);
    },
  },
});
```

`cypress/support/e2e.js`, where the commands come from:

```js
import 'cypress-facteur';
```

## The commands

| | |
|---|---|
| `cy.facteurAddress(local?)` | The address this test receives at, tagged with its title and attempt. |
| `cy.facteurWaitFor(criteria?)` | Wait for a message addressed to this test, and yield it. |
| `cy.facteurMessages()` | Everything in the inbox: this test's mail and its neighbours'. |
| `cy.facteurInbox()` | The inbox id and the domain it receives at. |
| `cy.facteurPurge()` | Destroy the inbox this run opened. |

All of them are chainable, so `.should()` and `.then()` work the way they do on
`cy.get()`.

**The attempt number is in the address**, and that is not decoration: without it a
retried test reads the mail its own first attempt received, and passes for the wrong
reason exactly when something is already flaky.

## When nothing arrives

The command fails with what the inbox actually held:

```
No message matched after 30s. Searched: {"inbox":"j3k9x2mq","sentTo":"signup-a0-lz9k"}.
In that inbox: welcome@j3k9x2mq.inbox.facteur.eu · Welcome aboard (parsed)
```

A red test should not need the documentation open.

## One inbox per run, one address per test

Every address ending in the inbox's domain arrives with nothing to create first, so a
sub-address isolates a test as well as a whole inbox would. It also survives your plan,
where an inbox per test would not: the ceiling is one inbox on the free plan and three on
Solo.

Name an existing inbox to skip creation, which is what most suites end up doing:

```sh
export FACTEUR_INBOX=j3k9x2mq
```

Without it, the plugin opens one for the run and `cy.facteurPurge()` destroys it. That
costs nothing: an operation is a message received, never a call.

## A working example

`example/` is a real Cypress project, run against a live stack in our own CI. It is the
copy-paste for `setupNodeEvents`, and the proof that this package works: a plugin cannot
be validated by simulation.

## Licence

MIT.
