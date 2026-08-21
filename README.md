# Facteur

Receive email and SMS in your test suite, and read them back without a sleep loop.

```ts
import { Facteur } from '@facteur-eu/sdk';

const facteur = new Facteur();                        // reads FACTEUR_API_KEY
const inbox = await facteur.inboxes.create({ name: 'signup', workspace: 'main' });

// Ask before you act: the request waits, and answers the moment the mail lands.
const arriving = facteur.messages.waitFor({
  inbox: inbox.id,
  sentTo: facteur.addressFor(inbox, 'run-4821'),
});

await signUp(facteur.addressFor(inbox, 'run-4821'));  // your application

const message = await arriving;
expect(message.otp).toBe(await codeShownOnScreen());
```

No polling, no retry loop, no regular expression pulling a six-digit code out of an HTML
body. The waiting happens on the server, and one-time codes and links are extracted when
the message is received.

## The packages

| | |
|---|---|
| [`@facteur-eu/sdk`](packages/sdk) | The client: inboxes, search, blocking wait, attachments, TOTP. Zero dependencies. |
| [`playwright-facteur`](packages/playwright-facteur) | A fixture that waits, matchers that assert, and the message attached to the report. |
| [`cypress-facteur`](packages/cypress-facteur) | Chainable commands, with the API key kept out of the browser. |
| [`create-facteur`](packages/create-facteur) | `npm create facteur`: two questions, one file, a first run that is green. |

Each has its own README with the whole story.

## Getting started

```sh
npm i -D @facteur-eu/sdk
export FACTEUR_API_KEY=fk_...
```

Create an account and mint a read-only key at [facteur.eu](https://facteur.eu). The free
plan opens a test mailbox and asks for no card. The API reference and the integration
guides are at [developers.facteur.eu](https://developers.facteur.eu).

## About this repository

This is the published half of Facteur: the packages you install, and nothing else. The
product itself is developed elsewhere and mirrored here on every release, so you will find
no pull requests from us and no long history.

**Issues are welcome and are read here.** A pull request is welcome too; it will be
carried over by hand, which is slower than a merge button and works.

## Licence

MIT.
