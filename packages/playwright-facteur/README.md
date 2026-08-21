# playwright-facteur

Receive email in your Playwright tests, and assert on what arrived.

```ts
import { test, expect } from 'playwright-facteur';

test('the verification link activates the account', async ({ page, inbox }) => {
  await page.goto('/signup');
  await page.getByLabel('Email').fill(inbox.address('signup'));
  await page.getByRole('button', { name: 'Create my account' }).click();

  const message = await inbox.waitFor();
  expect(message).toHaveOtp();

  await page.goto(message.links[0].href);
  await expect(page.getByText('Account verified')).toBeVisible();
});
```

No `sleep`, no retry loop, no regular expression pulling a six-digit code out of an HTML
body. The wait happens on the server; the extraction happens when the mail is received.

## Install

```sh
npm i -D playwright-facteur
export FACTEUR_API_KEY=fk_...
```

Node 20 or later, and Playwright 1.40 or later. Mint the key in the application under
**Settings → API keys**.

## What you get

**`inbox`** is a fixture, one address per test. The tag carries the worker index, the
retry number and the test title, so `--workers=16` collides with nothing. The retry
matters: without it, a retried test reads the mail its own first attempt received, and
passes for the wrong reason exactly when something is already flaky.

```ts
inbox.address()             // test+the-title-w3r0-lz9k@j3k9x2mq.inbox.facteur.eu
inbox.address('billing')    // billing+the-title-w3r0-lz9k@…
await inbox.waitFor({ subject: /invoice/ })
```

**Matchers**, retried by Playwright's own engine and inheriting the test's timeout:

```ts
await expect(inbox).toReceiveEmail({ subject: /verification/ });
expect(message).toHaveOtp('882314');
expect(message).toHaveLinkTo('app.example.com');
expect(message).toHaveAttachment('invoice.pdf');
```

`toHaveOtp` fails with a different sentence when the message is not parsed yet, because
"there is no code in this mail" and "the code is not extracted yet" are different
problems and an `undefined` cannot tell them apart.

**The message in the report.** Every awaited message is attached to the test: the JSON
for the extracted fields, the HTML body to open. When a test fails, the mail that
actually arrived is next to the failure.

## One inbox per worker, one address per test

Every address ending in the inbox's domain arrives, with nothing to create first, so a
sub-address isolates a test as well as a whole inbox would.

It also survives your plan. Creating an inbox per test walks into the inbox ceiling (one
on the free plan, three on Solo), so that arrangement works on a laptop and fails the
first time the suite runs on the plan you pay for.

Name an existing inbox to skip creation entirely, which is what most suites end up doing:

```sh
export FACTEUR_INBOX=j3k9x2mq
```

Without it, the plugin opens one per worker and destroys it at the end. That costs
nothing: an operation is a message received, never a call.

## Parallel runs

The API refuses past twenty open waits per organization. The client keeps its own queue,
sized from your worker count, so the surplus waits its turn instead of coming back as a
`429`.

## Licence

MIT.
