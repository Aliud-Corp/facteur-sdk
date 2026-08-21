/**
 * The half of this plugin that runs in Node, which is the half that matters.
 *
 * **Cypress executes a test inside the browser.** An API key has no business there — the
 * spec is served to a page, so a key in it is a key in a page's JavaScript — and `fetch`
 * from that page is subject to the origin of the application under test. Both problems
 * disappear the same way: the client lives in the Cypress process, and the browser half
 * reaches it through `cy.task`. That is why this package has two entry points where the
 * Playwright one has a single fixture file, and it is the only structural difference
 * between them.
 *
 * Registered once, in `cypress.config`:
 *
 *     import { defineConfig } from 'cypress';
 *     import { facteurTasks } from 'cypress-facteur/plugin';
 *
 *     export default defineConfig({
 *       e2e: {
 *         setupNodeEvents(on, config) {
 *           return facteurTasks(on, config);
 *         },
 *       },
 *     });
 *
 * It returns the config it was given, with the inbox it opened written into
 * `config.env` — which is how the browser half learns the address without ever seeing
 * the key.
 */

import { Facteur, FacteurTimeout, addressFor } from '@facteur-eu/sdk';

/** The tasks the browser half calls, and the only surface it can reach. */
const NAMES = {
  inbox: 'facteur:inbox',
  waitFor: 'facteur:waitFor',
  messages: 'facteur:messages',
  purge: 'facteur:purge',
};

/**
 * Register the tasks, and open the inbox the run will use.
 *
 * The inbox is opened lazily rather than here: `setupNodeEvents` runs before Cypress
 * knows whether any spec will need mail, and a config hook that opens an inbox — or
 * fails on a missing key — would break `cypress open` for somebody testing a form.
 */
export function facteurTasks(on, config = {}) {
  /** Resolved on first use, shared by every spec of this run. */
  let opened = null;
  let client = null;

  const facteur = () => {
    if (!client) {
      client = new Facteur({
        apiKey: config.env?.FACTEUR_API_KEY ?? process.env.FACTEUR_API_KEY,
        baseUrl: config.env?.FACTEUR_BASE_URL ?? process.env.FACTEUR_BASE_URL,
        /*
         * Cypress runs one spec at a time per process, so a wait queue of one is the
         * honest ceiling — several `cypress run` processes in parallel each get their own
         * and the organization's twenty is what bounds the total.
         */
        maxConcurrentWaits: 2,
      });
    }
    return client;
  };

  const inbox = async () => {
    if (opened) return opened;

    const named = config.env?.FACTEUR_INBOX ?? process.env.FACTEUR_INBOX;
    if (named) {
      const inboxes = await facteur().inboxes.list();
      const found = inboxes.find((one) => one.id === named);
      if (!found) {
        throw new Error(
          `FACTEUR_INBOX names ${named}, which this key does not reach. Check the id on the inbox screen, or widen the key's workspaces.`,
        );
      }
      opened = found;
      return opened;
    }

    opened = await facteur().inboxes.create({
      name: `cypress ${new Date().toISOString().slice(0, 10)}`,
      workspace: config.env?.FACTEUR_WORKSPACE ?? process.env.FACTEUR_WORKSPACE,
    });
    return opened;
  };

  on('task', {
    async [NAMES.inbox]() {
      const one = await inbox();
      return { id: one.id, domain: one.domain ?? null };
    },

    /**
     * Wait for a message, and hand back what a Cypress assertion can hold.
     *
     * A rejected task shows in Cypress as an unhandled error with a stack from the plugin
     * process, which reads as our bug rather than as a missing mail. So the timeout comes
     * back as a value the command turns into a proper failure, with the diagnostic
     * intact.
     */
    async [NAMES.waitFor]({ tag, criteria = {} } = {}) {
      const one = await inbox();
      try {
        const message = await facteur().messages.waitFor({
          inbox: one.id,
          ...(tag ? { sentTo: tag } : {}),
          ...criteria,
        });
        return { message };
      } catch (error) {
        if (!(error instanceof FacteurTimeout)) throw error;
        return {
          timedOut: {
            message: error.message,
            waitedMs: error.waitedMs,
            arrived: error.arrived ?? [],
          },
        };
      }
    },

    async [NAMES.messages]() {
      const one = await inbox();
      return facteur().inboxes.messages(one.id);
    },

    /**
     * Destroy the inbox, which is how it is purged, and only when we opened it: a suite
     * that named `FACTEUR_INBOX` gave us an address it means to keep.
     */
    async [NAMES.purge]() {
      if (!opened || (config.env?.FACTEUR_INBOX ?? process.env.FACTEUR_INBOX)) return null;
      await facteur().inboxes.delete(opened.id).catch(() => {});
      opened = null;
      return null;
    },
  });

  return config;
}

/** The task names, exported so a suite can call them directly if it prefers. */
export const tasks = NAMES;

/** Re-exported so a `cypress.config` importing only this file can build an address. */
export { addressFor };
