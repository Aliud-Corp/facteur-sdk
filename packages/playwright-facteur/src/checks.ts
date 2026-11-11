import type { Message } from '@facteur-eu/sdk'

export type Check = { pass: boolean; message: () => string }

/** The code of the message: any, or the expected one. A message refused for want of plan has no code to read. */
export function otpCheck(message: Message, expected?: string): Check {
    if (message.status !== 'parsed') {
        return { pass: false, message: () => `the message is ${message.status ?? 'in an unknown state'}: it was refused, and nothing derived from its body was kept` }
    }
    const found = message.otp ?? null
    return {
        pass: expected === undefined ? found !== null : found === expected,
        message: () => (expected === undefined ? `expected a one-time code, the message carries ${found ?? 'none'}` : `expected the code ${expected}, the message carries ${found ?? 'none'}`),
    }
}

/** The links of a message are strings (the API's `links`), compared by inclusion. */
export function linkCheck(message: Message, fragment: string): Check {
    const links = message.links ?? []
    return {
        pass: links.some((link) => link.includes(fragment)),
        message: () => `expected a link containing ${fragment}, the message carries ${links.length > 0 ? links.join(', ') : 'no link'}`,
    }
}

/** A real attachment, any or by name. Embedded images are another list (`inlines`) and never count. */
export function attachmentCheck(message: Message, fileName?: string): Check {
    const names = (message.attachments ?? []).map((one) => one.fileName)
    return {
        pass: fileName === undefined ? names.length > 0 : names.includes(fileName),
        message: () => `expected ${fileName ?? 'an attachment'}, the message carries ${names.length > 0 ? names.join(', ') : 'none'} (embedded images are never counted)`,
    }
}
