import type { Message } from '@facteur-eu/sdk'
import { describe, expect, it } from 'vitest'
import { attachmentCheck, linkCheck, otpCheck } from './checks.js'

const parsed: Message = {
    status: 'parsed',
    otp: '482913',
    links: ['https://app.example.test/confirm?token=abc', 'https://example.test/unsubscribe'],
    attachments: [{ id: 'a1', fileName: 'welcome.txt', contentType: 'text/plain', checksum: null, sizeBytes: 3, stored: true }],
    inlines: [{ id: 'i1', fileName: 'logo.png', contentType: 'image/png', contentId: 'logo', sizeBytes: 3 }],
}

describe('otpCheck', () => {
    it('passes on any code, and on the expected one', () => {
        expect(otpCheck(parsed).pass).toBe(true)
        expect(otpCheck(parsed, '482913').pass).toBe(true)
    })

    it('fails on another code and says which one the message carries', () => {
        const check = otpCheck(parsed, '000000')
        expect(check.pass).toBe(false)
        expect(check.message()).toContain('482913')
    })

    it('fails on a refused message, and says why', () => {
        const check = otpCheck({ status: 'quota_exceeded', errorCode: 'PLAN_QUOTA_EXCEEDED' })
        expect(check.pass).toBe(false)
        expect(check.message()).toContain('quota_exceeded')
    })
})

describe('linkCheck', () => {
    it('matches a link by a part of it', () => {
        expect(linkCheck(parsed, 'app.example.test/confirm').pass).toBe(true)
    })

    it('fails on a link the message does not hold and lists the links it holds', () => {
        const check = linkCheck(parsed, 'elsewhere.test')
        expect(check.pass).toBe(false)
        expect(check.message()).toContain('https://example.test/unsubscribe')
    })

    it('fails on a message without links', () => {
        expect(linkCheck({ status: 'parsed' }, 'a').message()).toContain('no link')
    })
})

describe('attachmentCheck', () => {
    it('matches any attachment, or one by name', () => {
        expect(attachmentCheck(parsed).pass).toBe(true)
        expect(attachmentCheck(parsed, 'welcome.txt').pass).toBe(true)
    })

    it('does not count an embedded image', () => {
        expect(attachmentCheck(parsed, 'logo.png').pass).toBe(false)
        expect(attachmentCheck({ status: 'parsed', inlines: parsed.inlines }).pass).toBe(false)
    })
})
