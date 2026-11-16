# @facteur-eu/sdk

Read the emails Facteur receives for your tests. Your application sends a mail to an address of a Facteur inbox, and the SDK waits for it and hands you its code and its links.

No runtime dependency. Node 22 or later.

## Install

```sh
npm install --save-dev @facteur-eu/sdk
```

Create an API key in the application, under Settings, API keys, and keep it in an environment variable:

```sh
export FACTEUR_API_KEY=fk_...
```

## Wait for a mail

```ts
import { Facteur, addressFor } from '@facteur-eu/sdk'

const facteur = new Facteur() // reads FACTEUR_API_KEY

const inbox = await facteur.inboxes.create({ name: 'signup-tests', workspace: 'main' })

// Any text before the @ works, so every test can use its own address in the same inbox.
const address = addressFor(inbox, 'test-42', { local: 'signup' })

// ... your application sends the confirmation mail to `address` ...

const message = await facteur.messages.waitFor({ inbox: inbox.id, sentTo: address, timeout: 20_000 })
console.log(message.otp, message.links)

await facteur.inboxes.delete(inbox.id!)
```

`waitFor` sends the search every second until a message matches, and returns the newest one. Unless you pass `since`, it counts the messages received from one minute before the call: the mail of an earlier run stays out, and a small difference between your clock and Facteur's does no harm. When none arrives in time it rejects with a `FacteurTimeout`, never with an empty list, so a suite cannot pass on a mail that never came. The error lists the last messages that did land in the inbox (`error.arrived`), which tells "the mail was never sent" from "the mail went to another address".

## The client

```ts
new Facteur({ apiKey, baseUrl, fetch, timeoutMs, pollIntervalMs })
```

| Option | Default |
| --- | --- |
| `apiKey` | `FACTEUR_API_KEY`. Without a key the constructor throws and nothing is sent. |
| `baseUrl` | `FACTEUR_BASE_URL`, then `https://api.facteur.eu` |
| `fetch` | the global `fetch` |
| `timeoutMs` | 30000, the limit of one request |
| `pollIntervalMs` | 1000, the pause between two searches of `waitFor` |

| Call | Does |
| --- | --- |
| `inboxes.list()` | lists the inboxes the key reaches |
| `inboxes.create({ name, workspace? })` | creates an inbox. Without `workspace`, the default workspace is looked up, which needs the `org:read` permission. A key made for a test suite usually lacks it, and the error then asks you to name the workspace. |
| `inboxes.update(id, patch)` | changes an inbox (sent as `application/merge-patch+json`) |
| `inboxes.delete(id)` | deletes an inbox and its messages |
| `inboxes.messages(id, { limit?, cursor? })` | one page of the last messages: `{ messages, nextCursor }` |
| `messages.search(criteria)` | one search (a `GET`, see "What a search sends"). Each message carries its text and HTML bodies and its headers, as `messages.get` returns it, so a link or a code is read without a second call. It answers at once, with an empty list when nothing matches yet. |
| `messages.waitFor({ ...criteria, timeout? })` | searches every second, 30 seconds by default (`timeout`, in milliseconds), and returns the newest match, bodies included |
| `messages.get(id)` | one message, by its identifier |
| `attachments.download(id)` | the bytes of an attachment, as an `ArrayBuffer` |
| `workspaces.list()` | lists the workspaces the key reaches (needs `org:read`) |
| `workspaces.get(slug)` | one workspace |
| `workspaces.inboxes(slug)` | the inboxes of a workspace |
| `extractors.list(inbox)` | lists the pointers saved on an inbox |
| `extractors.create(inbox, { key, pattern, scope, label? })` | saves a pointer: a pattern, the part of the message it reads, and the key its value is written under |
| `extractors.delete(inbox, id)` | deletes a pointer |
| `extractors.test(inbox, { pattern, scope })` | tries a pattern on the messages of the inbox without saving it |
| `extractors.suggest(inbox, { source, selection, offset })` | proposes patterns that find the selected text of a message |
| `addressFor(inbox, tag, { local })` | an address of the inbox that carries your tag. An SMS inbox has a number and no address, and throws. |

## What a search sends

A search is a `GET` request, and each criterion is a parameter of its address (`/messages?inbox=ib_1&subject=Welcome`). The words you search for therefore appear in the address, and can be written in the logs of a proxy or a gateway between your machine and Facteur. Facteur keeps the parameters of this request out of its own logs. Search for an address, a subject or a code, and never for a secret.

Each text has a longest allowed length, in characters: `inbox` 36, `workspace` 40, `sentTo` and `sentFrom` 254, `subject`, `body` and `attachmentName` 255, `otp` 16. A longer value is refused with the code `CRITERIA_INVALID` (status 400). A `cursor` is at most 64 characters, and a longer one is refused with `INVALID_CURSOR`, like any cursor Facteur did not issue: pass `nextCursor` back as you received it. A boolean is `true` or `false`, and `limit` is a number. `since` is an ISO 8601 date, such as `2026-11-03T10:00:00Z`.

The API also takes the same criteria as a JSON body, on `POST /messages/search` (`searchMessagesByBody`), with the same limits, codes and answer. The SDK sends the `GET`; use the `POST` from another client when you do not want a criterion in an address.

## Errors

A refusal from the API becomes a `FacteurError` with three fields: `code` (the stable code to branch on), `status` and `body` (the raw `application/problem+json` answer). The `message` is a sentence written by the SDK, so it can say what to do.

```ts
try {
    await facteur.messages.search({ inbox: 'ib_1' })
} catch (error) {
    if (error instanceof FacteurError && error.code === 'CRITERIA_UNKNOWN') {
        // a typo in a criterion: the API refuses it instead of ignoring it
    }
}
```

The client retries only what the API documents as safe to retry: a `429` (after the `Retry-After` it sends) and a `503` with `ATTACHMENT_STORE_UNAVAILABLE`. Three retries at most. Every other refusal is raised at once.

## Many tests at once

A test that waits sends about one search a second, and a key may send 600 requests a minute. A suite that waits in ten tests at once stays under that limit. With more, some searches answer `429`: `waitFor` waits the `Retry-After` and goes on searching until its `timeout`, so the suite slows down instead of failing. Give each process its own key when the suite runs many workers.

## Versions

This package follows semantic versioning. A change that breaks your code only ships in a new major version.

## Support and security

Version 3.x receives security fixes until 15 November 2031, five years after 3.0.0 was released. Versions 2.0.0, 1.0.0 and 0.0.0 receive none: they target an API that no longer exists. Upgrade to 3.x.

To report a vulnerability, email security@facteur.eu or use the private reporting of the repository, never a public issue. The [security policy](https://github.com/Aliud-Corp/facteur-sdk/blob/main/SECURITY.md) says what happens next. Each [release](https://github.com/Aliud-Corp/facteur-sdk/releases) carries the software bill of materials (CycloneDX) of its version.

## Licence

MIT.
