// The first attempt receives its mail, then fails on purpose. The second attempt must not read that mail:
// it first checks that nothing is waiting at its address, then sends its own and reads it.
import { expect, test } from 'playwright-facteur'
import { sendTo } from '../support/mail.mjs'

test.describe.configure({ retries: 1 })

test('a replayed test does not read the mail of its first attempt', async ({ inbox }, testInfo) => {
    if (testInfo.retry === 0) {
        await sendTo(inbox, { subject: 'mail of attempt 0', text: 'Your code is 000000.' })
        await expect(inbox).toReceiveEmail({ subject: 'attempt 0' })
        throw new Error('the first attempt fails on purpose')
    }

    await expect(inbox).not.toReceiveEmail({ timeout: 3_000 })
    await sendTo(inbox, { subject: 'mail of attempt 1', text: 'Your code is 111111.' })
    const found = await inbox.waitFor()
    expect(found.subject).toBe('mail of attempt 1')
})
