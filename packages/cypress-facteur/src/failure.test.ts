import { Facteur, FacteurTimeout } from '@facteur-eu/sdk'
import { describe, expect, it } from 'vitest'
import { failureMessage } from './failure.js'

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

/** The timeout the SDK really raises: a search that finds nothing, then the listing of what the inbox holds. */
async function realTimeout(inbox: unknown[]): Promise<FacteurTimeout> {
    let call = 0
    const fetch = (async () => json(++call === 1 ? { messages: [] } : { messages: inbox })) as unknown as typeof globalThis.fetch
    const error = await new Facteur({ apiKey: 'fk_test', baseUrl: 'https://api.test', fetch }).messages.waitFor({ inbox: 'ib1', subject: 'Invoice', wait: 1 }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(FacteurTimeout)
    return error as FacteurTimeout
}

const timedOut = (error: FacteurTimeout, criteria: object, address: string) => ({ criteria, waitedMs: error.waitedMs, address, arrived: error.arrived })

describe('failureMessage', () => {
    it('says what did arrive once, in the format of the Playwright matcher', async () => {
        const error = await realTimeout([{ id: 'm1', toAddress: 'a@d', subject: 'Welcome', status: 'parsed' }, { id: 'm2', toAddress: 'b@d', status: 'parsed' }])
        const text = failureMessage(timedOut(error, { subject: 'Invoice' }, 'test+t@d'))
        expect(text).toContain('No message matched {"subject":"Invoice"} at test+t@d.')
        expect(text).toMatch(/\nWaited \d+s\. What did arrive: a@d, "Welcome" \(parsed\); b@d, no subject \(parsed\)\.$/)
        expect(text.match(/What did arrive/g)).toHaveLength(1)
    })

    it('says that nothing arrived', async () => {
        const text = failureMessage(timedOut(await realTimeout([]), {}, 'test+t@d'))
        expect(text).toContain('nothing arrived in that inbox during the wait')
        expect(text.match(/nothing arrived/gi)).toHaveLength(1)
    })
})
