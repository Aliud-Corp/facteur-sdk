/**
 * Types for `plugin.mjs`, hand-written beside it.
 *
 * Deliberately structural rather than importing Cypress's own types: this file is loaded
 * by `cypress.config`, where Cypress is present, but the package must also typecheck in a
 * repository that only has it as a peer.
 */

/** The `on` of `setupNodeEvents`, narrowed to what this plugin uses. */
export type TaskRegistrar = (
  event: 'task',
  tasks: Record<string, (argument?: unknown) => unknown>,
) => void;

export interface FacteurConfig {
  env?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Register the Facteur tasks and return the config, so `setupNodeEvents` can `return
 * facteurTasks(on, config)`.
 */
export declare function facteurTasks<T extends FacteurConfig>(on: TaskRegistrar, config: T): T;

/** The task names, for a suite that would rather call `cy.task` directly. */
export declare const tasks: {
  inbox: string;
  waitFor: string;
  messages: string;
  purge: string;
};

export { addressFor } from '@facteur-eu/sdk';
