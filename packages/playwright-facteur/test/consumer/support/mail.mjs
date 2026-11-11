// Sending a mail to the inbox of the stack, over SMTP to `127.0.0.1:2525`. This is the consumer project's own
// helper, not part of the package: a customer's application sends its mail by its own means.
import { Socket } from 'node:net'

const SMTP = { host: '127.0.0.1', port: 2525 }

/** Sends one message (CRLF line ends) and returns the reply to the end of DATA. */
export async function send(recipient, message) {
    const socket = new Socket()
    await new Promise((resolve, reject) => {
        socket.once('error', reject)
        socket.connect(SMTP.port, SMTP.host, resolve)
    })
    socket.setEncoding('utf8')
    let buffer = ''
    const waiting = []
    socket.on('data', (chunk) => {
        buffer += chunk
        const lines = buffer.split('\r\n')
        // A reply ends at the first line whose fourth character is a space.
        const end = lines.findIndex((line, index) => index < lines.length - 1 && /^\d{3} /.test(line))
        if (end === -1) return
        const reply = lines.slice(0, end + 1).join('\r\n')
        buffer = lines.slice(end + 1).join('\r\n')
        waiting.shift()?.(reply)
    })
    const read = () => new Promise((resolve) => waiting.push(resolve))
    const expect = async (prefix) => {
        const reply = await read()
        if (!reply.startsWith(prefix)) throw new Error(`SMTP: expected ${prefix}, the ingester said ${reply}`)
        return reply
    }
    const line = (text) => socket.write(`${text}\r\n`)

    try {
        await expect('220')
        line('EHLO consumer.example.test')
        await expect('250')
        line('MAIL FROM:<sender@example.test>')
        await expect('250')
        line(`RCPT TO:<${recipient}>`)
        await expect('250')
        line('DATA')
        await expect('354')
        socket.write(message.replace(/\r\n\./g, '\r\n..'))
        line('\r\n.')
        const accepted = await expect('250')
        line('QUIT')
        return accepted
    } finally {
        socket.destroy()
    }
}

/** A multipart message: text and HTML bodies, and an attachment when `attachment` is given. */
export function compose({ to, subject, text, html, attachment }) {
    const boundary = `b-${Math.random().toString(36).slice(2)}`
    const inner = `i-${Math.random().toString(36).slice(2)}`
    const lines = [
        'From: Sender <sender@example.test>',
        `To: <${to}>`,
        `Subject: ${subject}`,
        `Message-ID: <${Math.random().toString(36).slice(2)}@example.test>`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        `Content-Type: multipart/alternative; boundary="${inner}"`,
        '',
        `--${inner}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        text,
        `--${inner}`,
        'Content-Type: text/html; charset=utf-8',
        '',
        html ?? `<p>${text}</p>`,
        `--${inner}--`,
    ]
    if (attachment) {
        lines.push(
            `--${boundary}`,
            `Content-Type: text/plain; name="${attachment.name}"`,
            `Content-Disposition: attachment; filename="${attachment.name}"`,
            'Content-Transfer-Encoding: base64',
            '',
            Buffer.from(attachment.content).toString('base64'),
        )
    }
    lines.push(`--${boundary}--`, '')
    return lines.join('\r\n')
}

/** Sends a mail to `inbox.address('qa')` and returns once the ingester accepted it. */
export async function sendTo(inbox, fields) {
    const to = inbox.address('qa')
    const reply = await send(to, compose({ to, ...fields }))
    if (!reply.startsWith('250')) throw new Error(`the ingester refused the mail: ${reply}`)
}
