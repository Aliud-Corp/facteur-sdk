/**
 * Types for `facteur.mjs`, hand-written beside it.
 *
 * The arrangement every package here uses, and the one that matters most for this one:
 * a published tarball with no build step is a tarball that cannot ship stale JavaScript
 * compiled from newer sources. The price is that the signatures live next to the body
 * rather than inside it, and the unit tests are what keep the two honest.
 *
 * The message shape follows the published API reference. Where that document says a
 * field may be absent, it is optional here — `status` is what a caller reads first, and
 * a type that promised `otp: string | null` on an unparsed message would be lying in the
 * one place this API asks people to be careful.
 */

export type Channel = 'email' | 'sms';

/** `received` — stored, not parsed yet. `parsed` — everything is populated. */
export type MessageStatus = 'received' | 'parsed' | 'quota_exceeded';

export interface Attachment {
  id: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number;
  /** `sha256:` and the hex digest — verify content without downloading the file. */
  checksum: string | null;
  stored: boolean;
  reason?: 'PERFORMANCE_MODE' | 'ATTACHMENT_TOO_LARGE' | 'STORAGE_QUOTA_EXCEEDED';
  url: string;
}

export interface Message {
  id: string;
  inbox: string;
  type: Channel;
  receivedAt: string;
  deliveryMs?: number;
  /** Read this before anything derived from the body. */
  status: MessageStatus;
  from: { address: string; name: string | null };
  to: string;
  sizeBytes?: number;
  subject?: string | null;
  text?: { body: string | null };
  html?: { body: string | null };
  /** The one-time code found in the message. The field most suites assert on. */
  otp?: string | null;
  links?: Array<Record<string, unknown>>;
  codes?: Array<Record<string, unknown>>;
  headers?: Record<string, unknown>;
  /** One property per extractor saved on the inbox, keyed by the extractor's key. */
  extract?: Record<string, unknown>;
  attachments?: Attachment[];
  inlines?: Array<Record<string, unknown>>;
  error?: { code: string; message: string };
}

export interface Inbox {
  id: string;
  name: string;
  description: string;
  channel: Channel;
  /** Present on email inboxes only — absent when `channel` is `sms`. */
  domain?: string;
  createdAt: string;
  messageCount?: number;
  messagesThisMonth?: number;
  lastMessageAt?: string | null;
  extractorCount?: number;
  tags?: string[];
  retentionDays?: number;
  performanceMode?: boolean;
  workspace?: { slug: string; name: string };
}

export interface Workspace {
  slug: string;
  name: string;
  createdAt: string;
  isDefault: boolean;
  inboxCount?: number;
  messagesThisMonth?: number;
}

/** At least one criterion. An empty search is refused rather than matched. */
export interface SearchCriteria {
  inbox?: string;
  workspace?: string;
  sentTo?: string;
  sentFrom?: string;
  subject?: string;
  body?: string;
  /** Read against the extracted code, never against the body. */
  otp?: string;
  since?: string;
  match?: 'all' | 'any';
  /** `parsed` by default: a message exists before it is parsed. */
  status?: 'parsed' | 'any';
  type?: Channel;
  hasAttachment?: boolean;
  attachmentName?: string;
  hasOtp?: boolean;
  limit?: number;
  cursor?: string | null;
  /** Milliseconds to hold the connection open. Clamped to five minutes by the API. */
  wait?: number;
}

export interface SearchResult {
  messages: Message[];
  nextCursor: string | null;
}

export interface InboxCreate {
  /** Defaults to the organization's default workspace, resolved once. */
  workspace?: string;
  name: string;
  description?: string;
  channel?: Channel;
}

export interface FacteurOptions {
  /** Defaults to `FACTEUR_API_KEY`. */
  apiKey?: string;
  /** Defaults to `FACTEUR_BASE_URL`, then to the production API. */
  baseUrl?: string;
  /** Injectable for tests. Defaults to the global `fetch`. */
  fetch?: typeof globalThis.fetch;
  /** How many waits this client holds open at once. Defaults to 8; the API refuses past 20 per organization. */
  maxConcurrentWaits?: number;
  timeoutMs?: number;
}

export declare class FacteurError extends Error {
  /** The stable, machine-readable reason. Branch on this, never on the message. */
  code: string | null;
  status: number | null;
  /** The raw answer, for whoever wants the API's own French sentence anyway. */
  body: unknown;
  constructor(message: string, details?: { code?: string; status?: number; body?: unknown });
}

/** `waitFor` ran out of time: the mail did not arrive, which is not an integration fault. */
export declare class FacteurTimeout extends FacteurError {
  criteria: SearchCriteria;
  waitedMs: number;
  /** What did land in that inbox instead, which is usually the answer. */
  arrived: Message[];
}

/**
 * The address an inbox receives at, tagged so two tests do not collide.
 *
 * Takes the inbox or its domain — never its id: the domain is the inbox's to state, and
 * an SMS inbox has none.
 */
export declare function addressFor(
  inbox: Inbox | string,
  tag?: string,
  options?: { local?: string },
): string;

export declare class Facteur {
  constructor(options?: FacteurOptions);

  readonly apiKey: string;
  readonly baseUrl: string;

  addressFor(inbox: Inbox | string, tag?: string, options?: { local?: string }): string;

  readonly inboxes: {
    list(): Promise<Inbox[]>;
    create(inbox: InboxCreate): Promise<Inbox>;
    update(id: string, patch: Partial<InboxCreate> & Record<string, unknown>): Promise<Inbox>;
    delete(id: string): Promise<unknown>;
    messages(id: string): Promise<Message[]>;
  };

  readonly messages: {
    search(criteria: SearchCriteria): Promise<SearchResult>;
    /** The newest match. Rejects with `FacteurTimeout` rather than returning nothing. */
    waitFor(criteria: SearchCriteria): Promise<Message>;
    get(id: string): Promise<Message>;
  };

  readonly attachments: {
    download(id: string): Promise<ArrayBuffer>;
  };

  readonly extractors: {
    list(inbox: string): Promise<unknown>;
    create(inbox: string, extractor: Record<string, unknown>): Promise<unknown>;
    delete(inbox: string, id: string): Promise<unknown>;
    test(inbox: string, body: Record<string, unknown>): Promise<unknown>;
    suggest(inbox: string, body: Record<string, unknown>): Promise<unknown>;
  };

  readonly workspaces: {
    list(): Promise<Workspace[]>;
    get(slug: string): Promise<Workspace>;
    inboxes(slug: string): Promise<Inbox[]>;
  };
}
