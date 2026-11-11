// Played alone, and expected to fail: the repository's spec reads the failure message.
import { expect, test } from 'playwright-facteur'
import { sendTo } from '../support/mail.mjs'

test.setTimeout(12_000)

test('waits for a subject that never comes', async ({ inbox }) => {
    await sendTo(inbox, { subject: 'Welcome to the absent test', text: 'Nothing to see.' })
    await expect(inbox).toReceiveEmail({ subject: 'Your invoice' })
})
