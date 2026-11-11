import type { Message } from '@facteur-eu/sdk'
import { FacteurTimeout } from '@facteur-eu/sdk'
import { expect as base } from '@playwright/test'
import type { ExpectMatcherState, MatcherReturnType } from '@playwright/test'
import { attachmentCheck, linkCheck, otpCheck } from './checks.js'
import type { ReceiveCriteria, TestInbox } from './fixtures.js'

function isInbox(subject: Message | TestInbox): subject is TestInbox {
    return typeof (subject as TestInbox).waitFor === 'function'
}

/** The message a matcher reads: the one it is given, or the last one the inbox received. */
function messageOf(subject: Message | TestInbox): Message | string {
    if (!isInbox(subject)) return subject
    return subject.latest ?? 'no message was received yet in this test: await expect(inbox).toReceiveEmail() first, or pass the message'
}

/** What did arrive, in one line per message, for the failure of `toReceiveEmail`. */
function describeArrived(messages: Message[]): string {
    if (messages.length === 0) return 'nothing arrived in that inbox during the wait'
    return messages.map((one) => `${one.toAddress ?? 'unknown recipient'}, ${one.subject ? `"${one.subject}"` : 'no subject'} (${one.status ?? 'unknown status'})`).join('; ')
}

function withMessage(subject: Message | TestInbox, name: string, check: (message: Message) => { pass: boolean; message: () => string }): MatcherReturnType {
    const message = messageOf(subject)
    if (typeof message === 'string') return { pass: false, name, message: () => message }
    return { name, ...check(message) }
}

export const expect = base.extend({
    /**
     * `await expect(inbox).toReceiveEmail({ subject: 'code' })`.
     *
     * The wait is the server's: the criteria go out once and the connection answers as soon as a message
     * matches. The criteria are Facteur's (substrings of the subject, the body, the sender...). The message found is
     * kept on the inbox (`inbox.latest`) and attached to the report.
     */
    async toReceiveEmail(this: ExpectMatcherState, inbox: TestInbox, criteria: ReceiveCriteria = {}): Promise<MatcherReturnType> {
        try {
            await inbox.waitFor(criteria)
            return { pass: true, name: 'toReceiveEmail', message: () => `expected no message matching ${JSON.stringify(criteria)} at ${inbox.address()}, one arrived` }
        } catch (error) {
            if (!(error instanceof FacteurTimeout)) throw error
            return {
                pass: false,
                name: 'toReceiveEmail',
                message: () =>
                    [
                        `No message matched ${JSON.stringify(criteria)} at ${inbox.address()}.`,
                        `Waited ${Math.round(error.waitedMs / 1000)}s. What did arrive: ${describeArrived(error.arrived)}.`,
                    ].join('\n'),
            }
        }
    },

    /**
     * `expect(message).toHaveOtp('123456')`, or `expect(inbox).toHaveOtp()` for the last message received.
     * A matcher rather than a field read: an unparsed message has no code yet, and `undefined` cannot tell
     * "no code in this mail" from "not read yet".
     */
    toHaveOtp(this: ExpectMatcherState, subject: Message | TestInbox, expected?: string): MatcherReturnType {
        return withMessage(subject, 'toHaveOtp', (message) => otpCheck(message, expected))
    },

    /** `expect(message).toHaveLinkTo('app.example.com')`: any link of the message that contains the text. */
    toHaveLinkTo(this: ExpectMatcherState, subject: Message | TestInbox, fragment: string): MatcherReturnType {
        return withMessage(subject, 'toHaveLinkTo', (message) => linkCheck(message, fragment))
    },

    /** `expect(message).toHaveAttachment('invoice.pdf')`, or any attachment without a name. An embedded image is not one. */
    toHaveAttachment(this: ExpectMatcherState, subject: Message | TestInbox, fileName?: string): MatcherReturnType {
        return withMessage(subject, 'toHaveAttachment', (message) => attachmentCheck(message, fileName))
    },
})
