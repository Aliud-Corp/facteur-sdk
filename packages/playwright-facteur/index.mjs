/**
 * Facteur inside Playwright: a fixture that waits, matchers that assert, and the message
 * that arrived attached to the report.
 *
 * **Why this exists when a ten-line fixture would do.** The objection is a fair one:
 * Playwright's fixtures make a plugin less indispensable than Cypress's command registry.
 * Four things answer it, and none of them is a wrapper around a call:
 *
 *   1. **The address is derived from the test, not written by hand.** Worker index, test
 *      title and retry number make a sub-address no other test can collide with, which is
 *      what lets a suite run at `--workers=16` against one inbox.
 *   2. **The matchers are retried by Playwright's own engine** and rewrite their failure.
 *      `await expect(inbox).toReceiveEmail({ subject: /code/ })` inherits the test's
 *      timeout and prints what did arrive. An `await` on a promise does neither.
 *   3. **The message lands in the report.** `testInfo.attach` puts the subject, the
 *      headers, the extracted fields and the HTML body next to the failure — the
 *      difference between "the test failed" and "here is the mail that arrived instead".
 *   4. **The wait ceiling follows the worker count.** The API refuses past twenty open
 *      waits per organization; the plugin knows `workerInfo`, a hand-written fixture does
 *      not.
 *
 * **One inbox per worker, not one per test — and that is a product decision, not a
 * shortcut.** Every address ending in an inbox's domain arrives without being created
 * first, so a sub-address per test isolates just as well as an inbox per test would, at
 * no cost. Creating one per test would also walk straight into the inbox ceiling, which
 * is one on the free plan and three on Solo: the isolation would work on a laptop and
 * fail the first time somebody ran the suite on the plan they actually pay for.
 */

import { test as base, expect } from '@playwright/test';
import { Facteur, FacteurTimeout, addressFor } from '@facteur-eu/sdk';

/** Characters that survive in the local part of an address, and read back on a screen. */
const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

/**
 * The Playwright fixtures, and the object a test actually holds.
 *
 * `inbox` is per test even though the inbox itself is per worker: what the test gets is a
 * view onto the shared inbox carrying *its* address, which is the thing that must not be
 * shared.
 */
export const test = base.extend({
  /** The client, one per worker: it holds the wait queue, which is per process. */
  facteur: [
    async ({}, use, workerInfo) => {
      const client = new Facteur({
        /*
         * Half the workers' ceiling, floored at one. Twenty waits is per *organization*,
         * so every worker of every suite in that organization shares it — a client that
         * spent it alone would push the refusal onto whoever started second.
         */
        maxConcurrentWaits: Math.max(1, Math.floor(16 / Math.max(1, workerInfo.config.workers))),
      });
      await use(client);
    },
    { scope: 'worker' },
  ],

  /**
   * The inbox, opened once per worker and destroyed with it.
   *
   * `FACTEUR_INBOX` names an existing one, which is what a suite on a plan with a single
   * inbox does — and what most suites end up doing, since an inbox is a stable address
   * worth putting in a CI secret rather than a thing to create four times a minute.
   */
  facteurInbox: [
    async ({ facteur }, use, workerInfo) => {
      const existing = process.env.FACTEUR_INBOX;
      if (existing) {
        const inboxes = await facteur.inboxes.list();
        const found = inboxes.find((one) => one.id === existing);
        if (!found) {
          throw new Error(
            `FACTEUR_INBOX names ${existing}, which this key does not reach. Check the id on the inbox screen, or widen the key's workspaces.`,
          );
        }
        await use(found);
        return;
      }

      const opened = await facteur.inboxes.create({
        name: `playwright w${workerInfo.workerIndex}`,
        workspace: process.env.FACTEUR_WORKSPACE,
      });

      try {
        await use(opened);
      } finally {
        /*
         * Destroying is how an inbox is purged — there is no route that empties one. It
         * is also free: an operation is the message received, never the call.
         */
        await facteur.inboxes.delete(opened.id).catch(() => {});
      }
    },
    { scope: 'worker' },
  ],

  /**
   * What a test holds: the inbox, plus an address that belongs to this test alone.
   *
   * The tag carries the worker, the retry and the title. The retry matters more than it
   * looks: without it a retried test reads the mail its own first attempt received, and
   * passes for the wrong reason exactly when something is already flaky.
   */
  inbox: async ({ facteur, facteurInbox }, use, testInfo) => {
    const tag = `${slug(testInfo.title)}-w${testInfo.workerIndex}r${testInfo.retry}-${Date.now().toString(36)}`;
    const startedAt = Date.now();

    /**
     * How long to hold, when the caller does not say: whatever is left of the test's own
     * timeout, less two seconds to fail inside it.
     *
     * This is the difference between two failures. Held for a fixed thirty seconds inside
     * a ninety-second test, a missing mail reads as a passing wait followed by a failed
     * assertion; held past the test's timeout, Playwright kills the test and prints its
     * own message about a slow test. Neither says the mail never came. Ending two seconds
     * early means the plugin's diagnostic — what did arrive instead — is the last thing
     * written, which is the only one worth reading.
     *
     * `testInfo.timeout` is `0` when timeouts are disabled, and the SDK's own default
     * applies then: an unbounded wait would hang a suite on a mail that is never sent.
     */
    const remainingWait = () => {
      if (!testInfo.timeout) return undefined;
      const left = testInfo.timeout - (Date.now() - startedAt) - 2_000;
      return Math.max(1_000, Math.min(left, 300_000));
    };

    await use({
      id: facteurInbox.id,
      domain: facteurInbox.domain,
      tag,
      address: (local = 'test') => addressFor(facteurInbox, tag, { local }),

      async waitFor(criteria = {}) {
        const message = await facteur.messages.waitFor({
          inbox: facteurInbox.id,
          sentTo: tag,
          wait: remainingWait(),
          ...criteria,
        });
        await attach(testInfo, message);
        return message;
      },

      async messages() {
        return facteur.inboxes.messages(facteurInbox.id);
      },
    });
  },
});

/**
 * The message, in the HTML report.
 *
 * Two attachments rather than one: the JSON is what a developer reads for the extracted
 * fields, and the HTML body is what they open to see what the customer would have seen.
 * Both are named after the test, so a failure with three mails in it stays readable.
 */
async function attach(testInfo, message) {
  await testInfo.attach(`facteur-${message.id}.json`, {
    contentType: 'application/json',
    body: Buffer.from(JSON.stringify(message, null, 2)),
  });

  if (message.html?.body) {
    await testInfo.attach(`facteur-${message.id}.html`, {
      contentType: 'text/html',
      body: Buffer.from(message.html.body),
    });
  }
}

/** What a failed match should say, given what the inbox actually holds. */
function describe(messages) {
  if (!messages.length) return 'nothing arrived in that inbox during the wait';
  return messages
    .slice(0, 5)
    .map((one) => `${one.to} · ${one.subject ?? 'no subject'} (${one.status})`)
    .join('; ');
}

expect.extend({
  /**
   * `await expect(inbox).toReceiveEmail({ subject: /code/ })`.
   *
   * The wait is the server's, so this does not poll: it hands the criteria over and the
   * connection answers the moment a message matches. What Playwright adds is the failure
   * message and the timeout the test already carries.
   */
  async toReceiveEmail(inbox, criteria = {}) {
    try {
      const message = await inbox.waitFor(criteria);
      this.received = message;
      return {
        pass: true,
        message: () => `expected no message matching ${JSON.stringify(criteria)}, one arrived`,
        name: 'toReceiveEmail',
      };
    } catch (error) {
      if (!(error instanceof FacteurTimeout)) throw error;
      const arrived = describe(error.arrived ?? []);
      return {
        pass: false,
        name: 'toReceiveEmail',
        message: () =>
          [
            `No message matched ${JSON.stringify(criteria)} at ${inbox.address()}.`,
            `Waited ${Math.round((error.waitedMs ?? 0) / 1000)}s. What did arrive: ${arrived}.`,
          ].join('\n'),
      };
    }
  },

  /**
   * `expect(message).toHaveOtp()` — and the reason it is a matcher rather than a field
   * read: an unparsed message has no `otp`, and asserting on `undefined` cannot tell
   * "there is no code in this mail" from "the code is not extracted yet".
   */
  toHaveOtp(message, expected) {
    if (message.status !== 'parsed') {
      return {
        pass: false,
        name: 'toHaveOtp',
        message: () =>
          `the message is ${message.status}, so nothing derived from its body is populated yet — read status before any extracted field`,
      };
    }

    const pass = expected === undefined ? Boolean(message.otp) : message.otp === expected;
    return {
      pass,
      name: 'toHaveOtp',
      message: () =>
        expected === undefined
          ? `expected a one-time code, the message carries ${message.otp ?? 'none'}`
          : `expected the code ${expected}, the message carries ${message.otp ?? 'none'}`,
    };
  },

  /** `expect(message).toHaveLinkTo('app.example.com')` — host, or any part of the URL. */
  toHaveLinkTo(message, fragment) {
    const links = (message.links ?? []).map((link) => link.href ?? link.url ?? '');
    const pass = links.some((href) => String(href).includes(fragment));
    return {
      pass,
      name: 'toHaveLinkTo',
      message: () =>
        `expected a link containing ${fragment}, the message carries ${links.length ? links.join(', ') : 'no link'}`,
    };
  },

  /** `expect(message).toHaveAttachment('invoice.pdf')` — a real one; a signature image is not. */
  toHaveAttachment(message, fileName) {
    const names = (message.attachments ?? []).map((one) => one.fileName);
    const pass = fileName === undefined ? names.length > 0 : names.includes(fileName);
    return {
      pass,
      name: 'toHaveAttachment',
      message: () =>
        `expected ${fileName ?? 'an attachment'}, the message carries ${names.length ? names.join(', ') : 'none'} (inline images are never counted)`,
    };
  },
});

export { expect };
export { FacteurTimeout } from '@facteur-eu/sdk';
