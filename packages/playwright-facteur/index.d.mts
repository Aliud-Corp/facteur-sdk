/**
 * Types for `index.mjs`, hand-written beside it — see `@facteur-eu/sdk` for why nothing
 * here is compiled.
 *
 * The matcher declarations are the part that earns its keep: without them
 * `expect(inbox).toReceiveEmail(...)` is a type error in the suites this package exists
 * for, which are written in TypeScript.
 */

import type { Inbox, Message, SearchCriteria, Facteur } from '@facteur-eu/sdk';
import type { TestType, PlaywrightTestArgs, PlaywrightTestOptions, PlaywrightWorkerArgs, PlaywrightWorkerOptions } from '@playwright/test';

/** The inbox as a test holds it: shared with its worker, addressed to this test alone. */
export interface TestInbox {
  id: string;
  domain?: string;
  /** The sub-address tag for this test: worker, retry and title. */
  tag: string;
  /** `test+<tag>@<inbox>.inbox.facteur.eu`, with `local` replacing `test`. */
  address(local?: string): string;
  /** Wait for a message addressed to this test. Attaches it to the report. */
  waitFor(criteria?: Omit<SearchCriteria, 'inbox'>): Promise<Message>;
  /** Everything currently in the shared inbox, this test's mail and its neighbours'. */
  messages(): Promise<Message[]>;
}

export interface FacteurFixtures {
  /** The client, one per worker. */
  facteur: Facteur;
  /** The inbox, opened once per worker or named by `FACTEUR_INBOX`. */
  facteurInbox: Inbox;
  /** This test's view onto it. */
  inbox: TestInbox;
}

export declare const test: TestType<
  PlaywrightTestArgs & PlaywrightTestOptions & FacteurFixtures,
  PlaywrightWorkerArgs & PlaywrightWorkerOptions & FacteurFixtures
>;

declare global {
  namespace PlaywrightTest {
    interface Matchers<R, T> {
      /** Wait for a message matching the criteria, and attach it to the report. */
      toReceiveEmail(criteria?: Omit<SearchCriteria, 'inbox'>): Promise<R>;
      /** A one-time code was extracted; optionally, this exact one. */
      toHaveOtp(expected?: string): R;
      /** A link whose URL contains this fragment. */
      toHaveLinkTo(fragment: string): R;
      /** A real attachment; an inline signature image is never counted. */
      toHaveAttachment(fileName?: string): R;
    }
  }
}

export { expect } from '@playwright/test';
export { FacteurTimeout } from '@facteur-eu/sdk';
