/**
 * Types for `commands.mjs`, hand-written beside it — see `@facteur-eu/sdk` for why nothing
 * here is compiled.
 *
 * The `Chainable` augmentation is the part that earns its keep: without it every
 * `cy.facteurWaitFor()` is a type error in the suites this package exists for.
 */

import type { Message } from '@facteur-eu/sdk';

export interface FacteurInboxHandle {
  id: string;
  domain: string | null;
}

/** Criteria accepted by the wait, minus the inbox and the recipient, which are ours. */
export interface FacteurCriteria {
  subject?: string;
  body?: string;
  sentFrom?: string;
  otp?: string;
  hasOtp?: boolean;
  hasAttachment?: boolean;
  attachmentName?: string;
  since?: string;
  match?: 'all' | 'any';
  status?: 'parsed' | 'any';
  wait?: number;
}

declare global {
  namespace Cypress {
    interface Chainable<Subject = any> {
      /** The inbox this run uses: its id, and the domain it receives at. */
      facteurInbox(): Chainable<FacteurInboxHandle>;
      /** The address this test receives at, tagged with its title and attempt. */
      facteurAddress(local?: string): Chainable<string>;
      /** Wait for a message addressed to this test. Fails with what did arrive instead. */
      facteurWaitFor(criteria?: FacteurCriteria): Chainable<Message>;
      /** Everything in the shared inbox. */
      facteurMessages(): Chainable<Message[]>;
      /** Destroy the inbox this run opened. */
      facteurPurge(): Chainable<null>;
    }
  }
}

export {};
