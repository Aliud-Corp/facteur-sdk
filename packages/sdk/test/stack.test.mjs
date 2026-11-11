// The SDK against the real stack, installed the way a customer installs it.
//
// This file is not run from the package folder: the maintainers' end-to-end spec packs the SDK, installs the
// archive in an empty folder, copies this file there and runs `node --test --use-system-ca`. It imports the package by its name, so it reads `exports` and `dist/`.
// The spec makes the stack these tests read (an inbox, a message sent over SMTP, three keys) and passes it in
// the environment.
//
// A fake agrees with the client about everything, including what the client got wrong: this file is the
// proof that does not.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Facteur, FacteurError, FacteurTimeout, addressFor } from '@facteur-eu/sdk'

function need(name) {
    const value = process.env[name]
    assert.ok(value, `${name} is not set: run this through the end-to-end spec`)
    return value
}

const baseUrl = need('FACTEUR_BASE_URL')
const inbox = need('FACTEUR_INBOX')
const tag = need('FACTEUR_TAG')
const code = need('FACTEUR_CODE')
const attachmentText = need('FACTEUR_ATTACHMENT_TEXT')

// The key that reads and writes (`ws:read` and `ws:write`) is the one of the environment, as in a test suite.
const facteur = new Facteur()

// The address domain is the inbox's to state, so it is read from the inbox and never built here.
const domain = (await facteur.inboxes.list()).find((entry) => entry.id === inbox)?.domain
assert.ok(domain, `the inbox ${inbox} has no domain`)

describe('the SDK against the stack', () => {
    it('waitFor returns the parsed message sent to the tagged address, with its code', async () => {
        const message = await facteur.messages.waitFor({ inbox, sentTo: addressFor(domain, tag, { local: 'qa' }), wait: 30_000 })
        assert.equal(message.status, 'parsed')
        assert.equal(message.otp, code)
    })

    it('waitFor carries the bodies, so a link or a code is read without a second call', async () => {
        const message = await facteur.messages.waitFor({ inbox, sentTo: addressFor(domain, tag, { local: 'qa' }), wait: 30_000 })
        assert.match(message.htmlBody ?? '', /<p>Your code is <b>/)
        assert.match(message.textBody ?? '', new RegExp(`Your code is ${code}`))
    })

    it('waitFor on another tag rejects with FacteurTimeout, which lists what did arrive', async () => {
        await assert.rejects(
            facteur.messages.waitFor({ inbox, sentTo: addressFor(domain, `${tag}-nobody`, { local: 'qa' }), wait: 2_000 }),
            (error) => {
                assert.ok(error instanceof FacteurTimeout)
                assert.equal(error.code, 'MESSAGE_NOT_RECEIVED')
                assert.equal(error.arrived.length, 1)
                assert.match(error.arrived[0].toAddress ?? '', new RegExp(`qa\\+${tag}@`))
                return true
            },
        )
    })

    it('messages.get returns the HTML body', async () => {
        const found = await facteur.messages.waitFor({ inbox, sentTo: addressFor(domain, tag, { local: 'qa' }), wait: 30_000 })
        const message = await facteur.messages.get(found.id)
        assert.match(message.htmlBody ?? '', /<p>Your code is <b>/)
    })

    it('attachments.download returns the bytes of the attachment', async () => {
        const found = await facteur.messages.waitFor({ inbox, sentTo: addressFor(domain, tag, { local: 'qa' }), wait: 30_000 })
        const message = await facteur.messages.get(found.id)
        const attachment = message.attachments?.[0]
        assert.ok(attachment, 'the message carries an attachment')
        assert.equal(attachment.stored, true)
        const bytes = await facteur.attachments.download(attachment.id)
        assert.equal(Buffer.from(bytes).toString('utf8'), attachmentText)
    })

    it('a read-only key that creates an inbox is refused with API_KEY_PERMISSION_MISSING', async () => {
        const reader = new Facteur({ apiKey: need('FACTEUR_READ_KEY'), baseUrl })
        await assert.rejects(reader.inboxes.create({ name: 'Never', workspace: need('FACTEUR_WORKSPACE') }), (error) => {
            assert.ok(error instanceof FacteurError)
            assert.equal(error.code, 'API_KEY_PERMISSION_MISSING')
            assert.equal(error.status, 403)
            return true
        })
    })

    it('an inbox of another organization is INBOX_NOT_FOUND', async () => {
        await assert.rejects(facteur.inboxes.messages(need('FACTEUR_OTHER_INBOX')), (error) => {
            assert.ok(error instanceof FacteurError)
            assert.equal(error.code, 'INBOX_NOT_FOUND')
            assert.equal(error.status, 404)
            return true
        })
    })
})
