# Facteur

Facteur receives the emails and SMS your application sends during a test, and lets the test read them back. This repository holds the four npm packages that do the reading.

```ts
import { Facteur, addressFor } from '@facteur-eu/sdk'

const facteur = new Facteur() // reads FACTEUR_API_KEY
const inbox = await facteur.inboxes.create({ name: 'signup', workspace: 'main' })
const address = addressFor(inbox, 'run-4821', { local: 'signup' })

// Your application sends its confirmation mail to `address`. The request waits
// on the server and answers the moment the mail lands.
const message = await facteur.messages.waitFor({ inbox: inbox.id, sentTo: address })
console.log(message.otp)
```

The test needs no sleep loop and no regular expression to pull a code out of an HTML body. One-time codes and links are extracted when the message is received.

## The packages

| Package | What it is |
| --- | --- |
| [`@facteur-eu/sdk`](packages/sdk) | The client: inboxes, search, blocking wait, attachments. No runtime dependency. |
| [`playwright-facteur`](packages/playwright-facteur) | A fixture that gives each test its own address, matchers for codes, links and attachments, and the message attached to the report. |
| [`cypress-facteur`](packages/cypress-facteur) | Commands that wait for the mail. The API key stays in Node, out of the browser. |
| [`create-facteur`](packages/create-facteur) | `npm create facteur`: two questions, then a first test that receives a mail. |

Each folder has its own README.

## Getting started

```sh
npm install --save-dev @facteur-eu/sdk
export FACTEUR_API_KEY=fk_...
```

Create an account and an API key at [facteur.eu](https://facteur.eu). The API reference and the integration guides are at [developers.facteur.eu](https://developers.facteur.eu).

## About this repository

This repository publishes the packages and nothing else. The product is developed elsewhere, and each release replaces the whole tree here, so the history is one commit per release. Issues are read here. A pull request is welcome and is carried over by hand, which is slower than a merge button.

Packages are published from this repository by the `publish` workflow, started by hand for one package at a time. npm records this repository and that workflow as the origin of each version (provenance), and no long-lived token exists.

## Licence

MIT.
