# playwright-facteur

Receive email in your Playwright tests. Your application sends a mail to an address of a Facteur inbox, and the test waits for it, reads its code, its links and its attachments, and finds the mail in the Playwright report.

Needs `@playwright/test` 1.60.0 or later, and Node 22 or later. It builds on `@facteur-eu/sdk`.

## Install

```sh
npm install --save-dev playwright-facteur @playwright/test
```

Create an API key in the application, under Settings, API keys. A key that reads and writes mail (`ws:read` and `ws:write`) is enough. Keep it, and the inbox your tests use, in the environment:

```sh
export FACTEUR_API_KEY=fk_...
export FACTEUR_INBOX=<the id of the inbox>
```

## Write a test

Import `test` and `expect` from `playwright-facteur` instead of `@playwright/test`.

```ts
import { expect, test } from 'playwright-facteur'

test('signs up with a confirmation code', async ({ page, inbox }) => {
    await page.goto('/signup')
    await page.getByLabel('Email').fill(inbox.address('signup'))
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(inbox).toReceiveEmail({ subject: 'confirmation code' })
    await expect(inbox).toHaveLinkTo('/confirm')
    await page.getByLabel('Code').fill(inbox.latest!.otp!)
})
```

`inbox.address('signup')` is an address that belongs to this test alone, such as `signup+sign-up-with-a-confirmation-code-1x2y3z-p0r0-m3k9q@<id>.inbox.facteur.eu`. Your application can send to any address of the inbox without creating anything first, so tests share one inbox and never read each other's mail.

## Fixtures

| Fixture | Scope | What it is |
| --- | --- | --- |
| `inbox` | test | The inbox seen through the address of this test. |
| `facteurInbox` | worker | The inbox of the worker. `FACTEUR_INBOX` names an existing one, which is what a plan with a single inbox needs. Without it, each worker opens an inbox (in `FACTEUR_WORKSPACE`, or in the default workspace if the key may read the organization) and deletes it when the worker ends. |
| `facteur` | worker | The `Facteur` client of the SDK, with the key from `FACTEUR_API_KEY` and the address from `FACTEUR_BASE_URL`. |

An `inbox` has:

| Member | Does |
| --- | --- |
| `address(local?)` | The address to send the mail under test to. `local` is the text before the `+`, `test` by default. |
| `waitFor(criteria?)` | Waits for a mail sent to this address, attaches it to the report and returns it. The criteria are the SDK's: `subject`, `body`, `sentFrom`, `otp`, `attachmentName`... plus `timeout` in milliseconds. |
| `latest` | The last message `waitFor` returned in this test, or `null`. |
| `messages()` | The last messages of the whole inbox, whatever their address. |
| `tag` | The part after the `+` of the address. |

## What isolates one test from another

The tag in the address is built from four things:

- the title of the test, and a short hash of its full path (project, file, groups), so two tests with the same title in two files differ;
- the parallel slot, so two tests running at once differ;
- the attempt number, so a test that Playwright replays does not read the mail its first attempt received;
- the run, so a suite that keeps its inbox between runs does not read the mail of the previous run.

## How long a test waits

A wait lasts as long as what is left of the test's own timeout, less two seconds, with five minutes at most. When the mail does not come, the failure is written by this package, inside the test's timeout, instead of Playwright's message about a slow test:

```
No message matched {"subject":"Your invoice"} at test+<tag>@<id>.inbox.facteur.eu.
Waited 6s. What did arrive: test+<tag>@<id>.inbox.facteur.eu, "Welcome" (parsed).
```

Pass `timeout` to wait less, for example to check that no mail was sent: `await expect(inbox).not.toReceiveEmail({ timeout: 3000 })`.

## Matchers

Each matcher takes a message or an inbox. With an inbox, it reads `inbox.latest`, the last message received in the test.

| Matcher | Passes when |
| --- | --- |
| `toReceiveEmail(criteria?)` | A message matching the criteria reaches the address of the test. |
| `toHaveOtp(code?)` | The message carries a one-time code, or this one. A message refused for want of plan fails with a message that says so. |
| `toHaveLinkTo(text)` | A link of the message contains the text. Links are strings. |
| `toHaveAttachment(fileName?)` | The message has an attachment, or one with this name. Embedded images such as a signature logo do not count. |

## The report

Each message `waitFor` returns is attached to the test in the report: `facteur-<message id>.json` holds the message as the API returned it, with its extracted code and links, and `facteur-<message id>.html.txt` holds the source of its HTML body, as plain text. The report never renders it: the HTML comes from whoever sent the mail, and a script in it would run in the report's page.

## Environment

| Variable | Use |
| --- | --- |
| `FACTEUR_API_KEY` | The API key. Required. |
| `FACTEUR_INBOX` | The id of the inbox to use. Without it each worker opens its own. |
| `FACTEUR_WORKSPACE` | The slug of the workspace in which workers open their inbox. |
| `FACTEUR_BASE_URL` | The address of the API. Defaults to `https://api.facteur.eu`. |

## Licence

MIT.
