// The same test, twice at once on the same inbox (`--repeat-each 2`, two workers): same title, same file, same attempt,
// only the parallel slot tells the two apart. Each copy waits until both mails are in the inbox before it reads, so
// that sharing an address would show: the newest mail would be the other copy's.
import { expect, test } from 'playwright-facteur'
import { sendTo } from '../support/mail.mjs'

test.describe.configure({ mode: 'parallel' })

test('reads only its own mail', async ({ inbox }, testInfo) => {
    const copy = testInfo.repeatEachIndex
    const code = String(333330 + copy)
    await sendTo(inbox, { subject: `mail of copy ${copy}`, text: `Your code is ${code}.` })
    await new Promise((resolve) => setTimeout(resolve, 3_000))

    const found = await inbox.waitFor()
    expect(found.subject).toBe(`mail of copy ${copy}`)
    await expect(inbox).toHaveOtp(code)
    expect(inbox.address()).toContain(inbox.tag)
})
