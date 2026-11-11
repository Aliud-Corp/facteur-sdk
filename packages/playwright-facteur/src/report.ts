import type { Message } from '@facteur-eu/sdk'

/** One file for the Playwright report. */
export type ReportAttachment = { name: string; contentType: string; body: Buffer }

/**
 * The message, as the report shows it: its JSON (the extracted fields, the links) and the source of its HTML body.
 *
 * The HTML body comes from whoever sent the mail. The report serves an attachment under its content type, from
 * the report's own origin: as `text/html`, a `<script>` in a received mail would run there. It is attached as
 * `text/plain`, under a `.html.txt` name, so the report shows the source and never renders it.
 */
export function reportAttachments(message: Message): ReportAttachment[] {
    const attachments: ReportAttachment[] = [
        { name: `facteur-${message.id}.json`, contentType: 'application/json', body: Buffer.from(JSON.stringify(message, null, 2)) },
    ]
    if (message.htmlBody) {
        attachments.push({ name: `facteur-${message.id}.html.txt`, contentType: 'text/plain', body: Buffer.from(message.htmlBody) })
    }
    return attachments
}
