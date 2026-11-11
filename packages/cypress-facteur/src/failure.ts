import type { Message } from '@facteur-eu/sdk'

/** What the plugin sends back when the mail did not come: values, so that the browser writes the failure. */
export type TimedOut = {
    /** The criteria the test passed (not the SDK's inbox and address, which the test did not write). */
    criteria: object
    waitedMs: number
    /** The address the wait was for: the test's tag and the inbox domain. */
    address: string
    arrived: Pick<Message, 'toAddress' | 'subject' | 'status'>[]
}

/** The failure of `cy.facteurWaitFor`, in the words of the Playwright matcher: what was asked, then what did arrive. */
export function failureMessage({ criteria, waitedMs, address, arrived }: TimedOut): string {
    const seen =
        arrived.length === 0
            ? 'nothing arrived in that inbox during the wait'
            : arrived.map((one) => `${one.toAddress ?? 'unknown recipient'}, ${one.subject ? `"${one.subject}"` : 'no subject'} (${one.status ?? 'unknown status'})`).join('; ')
    return [`No message matched ${JSON.stringify(criteria)} at ${address}.`, `Waited ${Math.round(waitedMs / 1000)}s. What did arrive: ${seen}.`].join('\n')
}
