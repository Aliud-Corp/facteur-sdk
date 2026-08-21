# Facteur

Receive email in your test suite, and read it back without a sleep loop.

```ts
import { Facteur } from '@facteur-eu/sdk';

const facteur = new Facteur();                        // reads FACTEUR_API_KEY
const inbox = await facteur.inboxes.create({ name: 'signup' });

// Ask before you act: the request waits, and answers the moment the mail lands.
const arriving = facteur.messages.waitFor({
  inbox: inbox.id,
  sentTo: facteur.addressFor(inbox, 'run-4821'),
});

await signUp(facteur.addressFor(inbox, 'run-4821'));  // your application

const message = await arriving;
expect(message.otp).toBe(await readCodeFromScreen());
await facteur.inboxes.delete(inbox.id);
```

That is the whole thing. No polling, no retry loop, no regular expression pulling a
six-digit code out of an HTML body: the wait happens on the server, and the extraction
happens on reception.

## Install

```sh
npm i -D @facteur-eu/sdk
```

Node 20 or later. **Zero dependencies**: a test suite does not want a dependency tree.

## A key

Mint one in the application, under **Settings → API keys**. Read-only is enough to
receive and read mail; creating and destroying inboxes needs `ws:write`.

```sh
export FACTEUR_API_KEY=fk_...
```

The client reads that variable by default. Pass `apiKey` explicitly if you would rather
keep it somewhere else. Never write it into a file that gets committed.

## What it does

| | |
|---|---|
| `inboxes.create({ name })` | Open an inbox. It lands in the default workspace unless you name one. |
| `inboxes.delete(id)` | Destroy it. This is how you purge: one inbox per run costs nothing. |
| `messages.waitFor(criteria)` | Wait for one message. **Rejects if none arrives** (see below). |
| `messages.search(criteria)` | The same query without the insistence: every match, and a cursor. |
| `attachments.download(id)` | The bytes. Each attachment also carries a `sha256:` checksum, so you can verify content without downloading it at all. |
| `addressFor(inbox, tag)` | `test+run-4821@<inbox>.inbox.facteur.eu`. Every address ending in the inbox's domain arrives, with nothing to create first. |
| `totp(secret)` | The six-digit code of a 2FA journey, so the phone can stay in the drawer. |

## Three things worth knowing

**`waitFor` fails loudly.** It never hands back an empty list, because a list makes every
caller write the same assertion and the suite that forgets goes green on a mail that
never arrived. When it expires it says what it searched, how long it held, and *what
landed instead*, which is usually the answer:

```
No message matched after 30s. Searched: {"inbox":"j3k9x2mq","sentTo":"signup+42"}.
What did arrive: welcome@j3k9x2mq.inbox.facteur.eu · “Welcome aboard” (parsed).
```

**Read `status` before anything derived from the body.** A message accepted over SMTP
exists before it is parsed; for a few milliseconds it has no subject, no code and no
links. `status` is what separates "there is no code in this message" from "the code is
not extracted yet". `waitFor` only returns parsed messages by default.

**Parallel workers are handled for you.** The API refuses past twenty open waits per
organization, which is one `--workers=24` away. The client queues the surplus rather
than turning it into a `429`; raise or lower the ceiling with `maxConcurrentWaits`.

## Errors

Every failure is a `FacteurError` carrying `code`: the stable, machine-readable reason,
and the thing to branch on. The message is written for whoever is reading a red pipeline.

```ts
import { FacteurError, FacteurTimeout } from '@facteur-eu/sdk';

try {
  await facteur.messages.waitFor({ inbox, sentTo });
} catch (error) {
  if (error instanceof FacteurTimeout) {
    // The mail did not arrive. That is a product failure, not an integration one.
  }
}
```

## Licence

MIT.
