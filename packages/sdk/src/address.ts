import type { Inbox } from './generated/types.gen.js'

/**
 * The address an inbox receives at, with a tag that tells one test from another.
 *
 * Everything before the `@` is yours: the inbox accepts any local part, so two tests can share an
 * inbox without creating anything first. It takes the inbox (or its domain) because the domain is
 * the inbox's to state; building `<id>.<domain>` here would hard-code a deployment into a published
 * package, and an SMS inbox has a number instead.
 */
export function addressFor(inbox: Pick<Inbox, 'channel' | 'domain'> | string, tag?: string, options: { local?: string } = {}): string {
    const domain = typeof inbox === 'string' ? inbox : inbox.channel === 'sms' ? undefined : inbox.domain
    if (!domain) {
        throw new TypeError('addressFor needs an email inbox or its domain. An SMS inbox has a number instead: read `channel` first.')
    }
    const local = options.local ?? 'test'
    return tag ? `${local}+${tag}@${domain}` : `${local}@${domain}`
}
