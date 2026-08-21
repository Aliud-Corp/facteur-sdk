/**
 * The browser half: four commands, and no key anywhere near them.
 *
 * Imported once, in `cypress/support/e2e.js`:
 *
 *     import 'cypress-facteur';
 *
 * Everything below goes through `cy.task`, which crosses into the Cypress process where
 * `cypress-facteur/plugin` holds the client. That indirection is not ceremony: a spec is
 * served to a page, so a key used here would be a key in a page's JavaScript.
 *
 * **Chainable, because that is what a Cypress user expects.** `cy.facteurWaitFor()`
 * yields the message, so `.should()` and `.then()` work on it the way they work on
 * `cy.get()`. Returning a bare promise would break the command queue — the failure mode
 * being a test that passes before the mail arrives.
 */

/* global Cypress, cy, expect */

const TASK = {
  inbox: 'facteur:inbox',
  waitFor: 'facteur:waitFor',
  messages: 'facteur:messages',
  purge: 'facteur:purge',
};

/** Characters that survive in the local part of an address, and read back on a screen. */
const slug = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

/**
 * The tag for the running test: its title, plus the attempt.
 *
 * The attempt is what stops a retried test from reading the mail its own first attempt
 * received — the failure that makes a flaky suite pass for the wrong reason, exactly when
 * something is already wrong. `Cypress.currentRetry` is 0 on the first run.
 *
 * **Memoised on the test, and the first version got that wrong.** It kept the tag on
 * `cy.state('runnable').ctx`, which is Mocha's *suite* context: every test inside one
 * `describe` shares it. Running the example suite showed it immediately — the third test
 * waited on the first test's address, and found the first test's mail. Two things came
 * out of that: the identity is `(title, attempt)`, computed here rather than stored on
 * anything Cypress owns, and a published package has no business reading `cy.state`,
 * which is internal API that can move under it.
 */
let memo = { key: null, tag: null };

function currentTag() {
  const title = Cypress.currentTest?.title ?? 'test';
  const attempt = Cypress.currentRetry ?? 0;
  const key = `${title}#${attempt}`;

  if (memo.key !== key) {
    memo = { key, tag: `${slug(title)}-a${attempt}-${Date.now().toString(36)}` };
  }

  return memo.tag;
}

Cypress.Commands.add('facteurInbox', () => cy.task(TASK.inbox, null, { log: false }));

/**
 * The address this test receives at.
 *
 * The tag is computed once per test and kept on the test context, so two calls in the
 * same test agree — the address is what the application is told, and a second, different
 * one would silently split the test in two.
 */
Cypress.Commands.add('facteurAddress', (local = 'test') =>
  cy.facteurInbox().then((inbox) => `${local}+${currentTag()}@${inbox.domain}`),
);

/**
 * Wait for a message addressed to this test, and yield it.
 *
 * The wait is the server's: the request stays open until a message matches. What Cypress
 * adds is the failure, written here rather than thrown from the plugin process — a
 * rejected task surfaces as an unhandled error with a stack from Node, which reads as our
 * bug rather than as a missing mail.
 */
Cypress.Commands.add('facteurWaitFor', (criteria = {}) => {
  return cy
    .task(TASK.waitFor, { tag: currentTag(), criteria }, { timeout: 310_000, log: false })
    .then((answer) => {
      if (answer?.timedOut) {
        const arrived = answer.timedOut.arrived
          .slice(0, 5)
          .map((one) => `${one.to} · ${one.subject ?? 'no subject'} (${one.status})`)
          .join('; ');
        throw new Error(
          `${answer.timedOut.message}${arrived ? `\nIn that inbox: ${arrived}` : ''}`,
        );
      }
      return answer.message;
    });
});

/** Everything currently in the shared inbox: this test's mail and its neighbours'. */
Cypress.Commands.add('facteurMessages', () => cy.task(TASK.messages, null, { log: false }));

/** Destroy the inbox this run opened. A suite that named its own inbox keeps it. */
Cypress.Commands.add('facteurPurge', () => cy.task(TASK.purge, null, { log: false }));
