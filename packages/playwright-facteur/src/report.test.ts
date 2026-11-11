import type { Message } from '@facteur-eu/sdk'
import { describe, expect, it } from 'vitest'
import { reportAttachments } from './report.js'

const hostile = { id: 'm1', status: 'parsed', htmlBody: '<p>Hello</p><script>alert(document.cookie)</script>' } as Message

describe('reportAttachments', () => {
    it('never attaches the received HTML as something the report would render', () => {
        const attachments = reportAttachments(hostile)

        expect(attachments.map((one) => one.contentType)).not.toContain('text/html')
        expect(attachments.every((one) => !one.name.endsWith('.html') && !one.name.endsWith('.htm'))).toBe(true)
    })

    it('keeps the HTML source, as plain text, for debugging', () => {
        const source = reportAttachments(hostile).find((one) => one.name === 'facteur-m1.html.txt')

        expect(source?.contentType).toBe('text/plain')
        expect(source?.body.toString()).toBe(hostile.htmlBody)
    })

    it('attaches the JSON alone when the message has no HTML body', () => {
        const attachments = reportAttachments({ id: 'm2', status: 'parsed' } as Message)

        expect(attachments.map((one) => [one.name, one.contentType])).toEqual([['facteur-m2.json', 'application/json']])
    })
})
