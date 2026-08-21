/**
 * The Facteur client: inboxes, and the mail that lands in them.
 *
 * **What this package is for.** A test that needs the code inside a confirmation email
 * has two options without a mailbox it can read: mock the mail away, proving nothing
 * about the thing most likely to break, or poll a real one in a loop with a magic number
 * in it. This is the third — and the loop is not reimplemented here, it is the server's:
 * `POST /v1/messages/search` holds the connection open until a message matches.
 *
 * Four rules shaped every line below.
 *
 * **1. `waitFor` rejects; it never returns an empty list.** A list forces every caller to
 * rewrite the same assertion, and the suite that forgets goes green on a mail that never
 * arrived. When it rejects it says what was searched, for how long, and — this is the
 * part worth the extra request — *what did arrive instead*. A red pipeline should not
 * require opening the documentation.
 *
 * **2. It writes its own sentences, in English.** The API returns a stable
 * `error.code` and a human `error.message`, and that message is **in French today**;
 * The published API reference says so, and tells callers not to parse it. Passing it
 * through would leak French into an English CI log, so the codes are branched on and the
 * words are ours.
 *
 * **3. Concurrent waits are queued client-side.** The API refuses past twenty open waits
 * per organization — `TOO_MANY_WAITS` — which is one `--workers=24` away. A local
 * semaphore holds the surplus instead of turning it into a 429, and the ceiling is a
 * setting, because an organization's real limit is not ours to guess.
 *
 * **4. Nothing is imported.** No dependency, and no workspace package either: this is
 * published, and the internal packages it could have leaned on are not. Anything shared
 * with them is copied rather than linked, and each copy says so where it sits.
 *
 * The surface is deliberately small: open an inbox, wait for a message, read it with what
 * was extracted from it, purge. Each call maps onto a route that exists. There is no
 * "empty an inbox" route, so purging is destroying the inbox: cheap by design, since
 * an operation is a message received, never a call and never a wait.
 */

/** Where the API answers, unless a caller says otherwise. */
const DEFAULT_BASE_URL = 'https://api.facteur.eu';

/**
 * How long `waitFor` holds by default. Thirty seconds is the API's own default and the
 * length of a signup journey; the server clamps anything above five minutes.
 */
const DEFAULT_WAIT_MS = 30_000;

/**
 * How many waits this client holds open at once.
 *
 * Eight rather than twenty: the ceiling is per *organization*, so two suites sharing a
 * key share it, and a client that spent it alone would push the failure onto whoever
 * started second.
 */
const DEFAULT_MAX_WAITS = 8;

/** Retries on the two failures where retrying is the documented answer. */
const MAX_RETRIES = 3;

/**
 * A refusal from the API, carrying the code to branch on.
 *
 * `code` is the contract. `message` is ours — see rule 2 — and `body` keeps the raw
 * answer for whoever needs the French sentence anyway.
 */
export class FacteurError extends Error {
  constructor(message, { code, status, body } = {}) {
    super(message);
    this.name = 'FacteurError';
    this.code = code ?? null;
    this.status = status ?? null;
    this.body = body ?? null;
  }
}

/**
 * `waitFor` ran out of time.
 *
 * Its own class because it is the one failure a test suite handles differently: the mail
 * did not arrive, which is a product failure, where every other error is an integration
 * one.
 */
export class FacteurTimeout extends FacteurError {
  constructor(message, details) {
    super(message, { code: 'MESSAGE_NOT_RECEIVED' });
    this.name = 'FacteurTimeout';
    Object.assign(this, details);
  }
}

/**
 * A counting semaphore, twelve lines.
 *
 * Rule 3 needs exactly this and nothing else. A queue library would be a dependency in a
 * package whose selling point is having none.
 */
function semaphore(limit) {
  let inFlight = 0;
  const waiting = [];

  const release = () => {
    inFlight -= 1;
    const next = waiting.shift();
    if (next) {
      inFlight += 1;
      next();
    }
  };

  return async function run(task) {
    if (inFlight >= limit) await new Promise((resolve) => waiting.push(resolve));
    else inFlight += 1;
    try {
      return await task();
    } finally {
      release();
    }
  };
}

/** `Retry-After` in either shape the RFC allows: seconds, or an HTTP date. */
function retryAfterMs(header) {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The address an inbox receives at, with a tag that separates one test from another.
 *
 * Sub-addressing is the whole reason two tests can share an inbox: everything after the
 * `+` is yours, and the inbox accepts every address ending in its domain without any of
 * them being created first.
 *
 * Takes the inbox object — or its domain — rather than its id, because the domain is the
 * inbox's to state. Deriving `<id>.inbox.facteur.eu` here would hard-code a deployment's
 * domain into a published package, and would be wrong for an SMS inbox, which has none.
 */
export function addressFor(inbox, tag, { local = 'test' } = {}) {
  const domain = typeof inbox === 'string' ? inbox : inbox?.domain;
  if (!domain) {
    throw new TypeError(
      'addressFor needs an email inbox or its domain. An SMS inbox has a number instead — read `channel` first.',
    );
  }
  return tag ? `${local}+${tag}@${domain}` : `${local}@${domain}`;
}

export class Facteur {
  /**
   * @param {object} [options]
   * @param {string} [options.apiKey] Defaults to `FACTEUR_API_KEY`, the convention this
   *   market already has: a key in an environment variable, never an argument in a file
   *   that gets committed.
   */
  constructor(options = {}) {
    const apiKey = options.apiKey ?? process.env.FACTEUR_API_KEY;
    if (!apiKey) {
      throw new TypeError(
        'No API key. Pass one, or set FACTEUR_API_KEY — mint it in the application under Settings → API keys.',
      );
    }

    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl ?? process.env.FACTEUR_BASE_URL ?? DEFAULT_BASE_URL).replace(
      /\/+$/,
      '',
    );
    this.fetch = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.gate = semaphore(options.maxConcurrentWaits ?? DEFAULT_MAX_WAITS);
    /** Resolved once, on the first inbox created without an explicit workspace. */
    this.defaultWorkspace = null;

    this.inboxes = {
      list: (...args) => this.#listInboxes(...args),
      create: (...args) => this.#createInbox(...args),
      update: (id, patch) => this.#request(`/v1/inboxes/${id}`, { method: 'PATCH', body: patch }),
      delete: (id) => this.#request(`/v1/inboxes/${id}`, { method: 'DELETE' }),
      messages: (id) => this.#request(`/v1/inboxes/${id}/messages`),
    };

    this.messages = {
      search: (...args) => this.#search(...args),
      waitFor: (...args) => this.#waitFor(...args),
      get: (id) => this.#request(`/v1/messages/${id}`),
    };

    this.attachments = {
      download: (id) => this.#download(id),
    };

    this.extractors = {
      list: (inbox) => this.#request(`/v1/inboxes/${inbox}/extractors`),
      create: (inbox, extractor) =>
        this.#request(`/v1/inboxes/${inbox}/extractors`, { method: 'POST', body: extractor }),
      delete: (inbox, id) =>
        this.#request(`/v1/inboxes/${inbox}/extractors/${id}`, { method: 'DELETE' }),
      test: (inbox, body) =>
        this.#request(`/v1/inboxes/${inbox}/extractors/test`, { method: 'POST', body }),
      suggest: (inbox, body) =>
        this.#request(`/v1/inboxes/${inbox}/extractors/suggest`, { method: 'POST', body }),
    };

    this.workspaces = {
      list: () => this.#listWorkspaces(),
      get: (slug) => this.#request(`/v1/workspaces/${slug}`),
      inboxes: (slug) => this.#request(`/v1/workspaces/${slug}/inboxes`),
    };
  }

  /** @see addressFor — the same function, reachable from the client for convenience. */
  addressFor(inbox, tag, options) {
    return addressFor(inbox, tag, options);
  }

  async #listInboxes() {
    return this.#request('/v1/inboxes');
  }

  /**
   * Open an inbox.
   *
   * An inbox lives inside a workspace, so one has to be named. When the caller does not,
   * the default workspace is resolved once and remembered — every organization has one,
   * and asking a test suite to know its slug would be asking it to care about a concept
   * it never uses.
   */
  async #createInbox({ workspace, ...inbox } = {}) {
    const slug = workspace ?? (await this.#resolveDefaultWorkspace());
    return this.#request(`/v1/workspaces/${slug}/inboxes`, { method: 'POST', body: inbox });
  }

  /**
   * The workspaces, unwrapped.
   *
   * `GET /v1/workspaces` answers `{ workspaces, canManage }`, where `GET /v1/inboxes`
   * answers a bare array — the envelope carries whether *this* caller may create one,
   * which is a question about a person and not about a key. A test suite never asks it,
   * so the array is what comes back here, and the difference is stated rather than
   * silently flattened.
   */
  async #listWorkspaces() {
    const body = await this.#request('/v1/workspaces');
    return Array.isArray(body) ? body : (body?.workspaces ?? []);
  }

  /**
   * The default workspace, and the refusal a test key actually meets.
   *
   * Listing workspaces needs `org:read`. A key minted for a suite holds `ws:read` and
   * sometimes `ws:write` — the scopes that reach mail — and `org:read` is a different
   * shape entirely: it describes the organization, not its inboxes. So the convenience
   * of omitting the workspace is not available to most keys, and the client says which
   * of the two fixes applies rather than passing on a scope error about a route the
   * caller never asked for.
   *
   * Found by running the smoke script against the live API, where a `ws:read, ws:write`
   * key answered `403 SCOPE_INSUFFICIENT` on `GET /v1/workspaces`. The fake server used
   * by the unit tests had happily returned the list: a fake agrees with the client about
   * everything, including what the client got wrong.
   */
  async #resolveDefaultWorkspace() {
    if (this.defaultWorkspace) return this.defaultWorkspace;

    let workspaces;
    try {
      workspaces = await this.#listWorkspaces();
    } catch (error) {
      if (error?.code === 'SCOPE_INSUFFICIENT') {
        throw new FacteurError(
          'Pass `workspace` to inboxes.create(): finding the default one requires the org:read scope, ' +
            'which a key minted for a test suite does not hold. Either name the workspace — its slug is on ' +
            'the inbox screen — or add org:read to the key.',
          { code: 'WORKSPACE_NOT_RESOLVABLE', status: error.status, body: error.body },
        );
      }
      throw error;
    }

    const chosen = workspaces.find((one) => one.isDefault) ?? workspaces[0];
    if (!chosen) {
      throw new FacteurError(
        'This key reaches no workspace, so there is nowhere to open an inbox. Widen its scope, or name a workspace.',
        { code: 'NO_WORKSPACE_IN_REACH' },
      );
    }

    this.defaultWorkspace = chosen.slug;
    return chosen.slug;
  }

  async #search(criteria = {}) {
    return this.#request('/v1/messages/search', { method: 'POST', body: criteria, wait: true });
  }

  /**
   * Wait for one message, and refuse to be silent about not finding it.
   *
   * Returns the newest match. On expiry it asks one more question — what did land in that
   * inbox, criteria removed — and puts the answer in the error. That request is free
   * (an operation is the message, not the call) and it is the difference between "the
   * mail did not arrive" and "the mail arrived, addressed to somebody else".
   */
  async #waitFor(criteria = {}) {
    const started = Date.now();
    const wait = criteria.wait ?? DEFAULT_WAIT_MS;
    const { messages } = await this.#search({ ...criteria, wait });
    if (messages?.length) return messages[0];

    const waited = Date.now() - started;
    const seen = await this.#whatArrivedInstead(criteria);

    throw new FacteurTimeout(
      [
        `No message matched after ${Math.round(waited / 1000)}s.`,
        `Searched: ${JSON.stringify(stripWait(criteria))}.`,
        seen.length
          ? `What did arrive: ${seen.map(describe).join('; ')}.`
          : 'Nothing at all arrived in that window — the sender never delivered, or it went to another inbox.',
      ].join(' '),
      { criteria: stripWait(criteria), waitedMs: waited, arrived: seen },
    );
  }

  /**
   * What did land in that inbox, for the timeout message.
   *
   * **The inbox listing, not a search.** A search needs at least one real criterion —
   * `inbox` and `status` are not among them — so asking "everything in this inbox" as a
   * search is answered `CRITERIA_EMPTY`, and the reference says as much: *« for the last
   * messages, read `GET /v1/inboxes/{id}/messages` »*. The first version asked anyway,
   * the catch below swallowed the 400, and every timeout said "nothing at all arrived"
   * even when the inbox was full. The unit test agreed with it, because the fake server
   * answered whatever it was asked.
   *
   * Forgiving of its own failure on purpose: a client that throws from its error path
   * replaces a useful timeout with a confusing one. Only when there is nothing to ask —
   * a search across a whole workspace, which has no listing route — does it stay silent.
   */
  async #whatArrivedInstead(criteria) {
    if (!criteria.inbox) return [];
    try {
      const messages = await this.#request(`/v1/inboxes/${criteria.inbox}/messages`);
      return (messages ?? []).slice(0, 5);
    } catch {
      return [];
    }
  }

  /** The bytes of an attachment, as an `ArrayBuffer`. */
  async #download(id) {
    const response = await this.#send(`/v1/attachments/${id}`, {});
    return response.arrayBuffer();
  }

  /**
   * One request, with the two retries the documentation asks for and no others.
   *
   * `429` is answered by honouring `Retry-After`, and `503 ATTACHMENT_STORE_UNAVAILABLE`
   * by trying again — the reference says so, and says a 404 would have been the wrong
   * shape for it. A `4xx` about the contract is never retried: `CRITERIA_UNKNOWN` stays
   * wrong however many times it is sent.
   */
  async #request(path, { method = 'GET', body, wait = false } = {}) {
    const run = () => this.#sendJson(path, { method, body });
    return wait ? this.gate(run) : run();
  }

  async #sendJson(path, { method, body }) {
    const response = await this.#send(path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async #send(path, init) {
    let lastError = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const response = await this.fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { authorization: `Bearer ${this.apiKey}`, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (response.ok) return response;

      const failure = await this.#failure(response, path);

      const retryable =
        response.status === 429 || failure.code === 'ATTACHMENT_STORE_UNAVAILABLE';
      if (!retryable || attempt === MAX_RETRIES) throw failure;

      lastError = failure;
      await sleep(retryAfterMs(response.headers.get('retry-after')) ?? 250 * 2 ** attempt);
    }

    throw lastError;
  }

  /** The refusal, turned into a sentence a reader can act on. */
  async #failure(response, path) {
    const text = await response.text().catch(() => '');
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text || null;
    }

    const code = body?.error?.code ?? null;
    return new FacteurError(explain(code, response.status, path, body), {
      code,
      status: response.status,
      body,
    });
  }
}

/**
 * What each refusal means, in the words of somebody reading a red pipeline.
 *
 * The API's own sentence is French and explicitly not part of the contract, so this maps
 * the codes a test suite actually meets. Anything unmapped falls back to naming the code
 * and the route, which is still more than a bare status.
 */
function explain(code, status, path, body) {
  switch (code) {
    case 'SCOPE_INSUFFICIENT':
      /*
       * Deliberately not naming a scope. The first version guessed `ws:write`, which is
       * right for creating an inbox and wrong for listing workspaces — that one wants
       * `org:read`, and the guess sent a reader looking for a permission they already
       * had. The API names the missing scope in `error.message`; that sentence is French
       * and not part of the contract, so it is pointed at rather than quoted.
       */
      return `The key does not hold the scope ${path} requires — error.body names it. A key minted for a test suite reaches mail (ws:read, ws:write) and not the organization (org:read).`;
    case 'TOO_MANY_WAITS':
      return 'Your organization already holds twenty open waits — usually a suite firing searches without awaiting them. Lower the worker count, or lower `maxConcurrentWaits` on the client.';
    case 'CRITERIA_UNKNOWN':
      return `A search criterion is not one: ${body?.error?.message ?? 'the API names it'}. An unknown criterion is refused rather than ignored, which is what stops a typo from matching every message.`;
    case 'CRITERIA_EMPTY':
      return 'A search with no criterion is not a search. For "the last messages", read the inbox instead.';
    case 'INBOX_NOT_FOUND':
      return 'No such inbox — or none this key reaches, which answers identically on purpose.';
    case 'MESSAGE_NOT_FOUND':
      return 'No such message, or one in a workspace this key does not reach.';
    case 'ATTACHMENT_NOT_STORED':
      return 'The attachment was described but never kept. Read `reason` on the message that listed it — performance mode, size, or storage quota.';
    default:
      break;
  }

  if (status === 401) return 'The key is unknown, revoked or expired.';
  if (status === 429) return 'Rate limited. The client retries what is retryable; this one was not.';
  return `${path} answered ${status}${code ? ` (${code})` : ''}.`;
}

/** The criteria as the caller wrote them, minus the plumbing, for an error message. */
function stripWait({ wait, limit, cursor, ...rest }) {
  return rest;
}

/** One line about a message that is not the one being waited for. */
function describe(message) {
  const to = message.to ?? 'unknown recipient';
  const subject = message.subject ? `“${message.subject}”` : 'no subject yet';
  return `${to} · ${subject} (${message.status})`;
}
