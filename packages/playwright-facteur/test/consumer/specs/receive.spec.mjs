import { expect, test } from 'playwright-facteur'
import { sendTo } from '../support/mail.mjs'

test('receives a sign-in mail and reads its code and its attachment', async ({ inbox }) => {
    await sendTo(inbox, {
        subject: 'Your confirmation code',
        text: 'Your code is 482913. Open https://app.example.test/confirm?token=abc to continue.',
        html: '<p>Your code is <b>482913</b>.</p><p><a href="https://app.example.test/confirm?token=abc">Confirm</a></p>',
        attachment: { name: 'welcome.txt', content: 'welcome to the app' },
    })

    await expect(inbox).toReceiveEmail({ subject: 'confirmation code' })
    await expect(inbox).toHaveOtp('482913')
    await expect(inbox).toHaveOtp()
    await expect(inbox).toHaveLinkTo('app.example.test/confirm?token=abc')
    await expect(inbox).not.toHaveLinkTo('evil.example.test')
    await expect(inbox).toHaveAttachment('welcome.txt')
    await expect(inbox).not.toHaveAttachment('invoice.pdf')
})
