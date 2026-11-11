import { describe, expectTypeOf, it } from 'vitest'
import type { Message } from './index.js'

// What a customer reads off a message (T3 proves it against the stack). A field renamed in the API
// stops compiling here, at `task packages:typecheck`, before any stack runs.
describe('the message the SDK returns', () => {
    it('carries the fields the guides read', () => {
        expectTypeOf<Message>().toHaveProperty('htmlBody')
        expectTypeOf<Message>().toHaveProperty('otp')
        expectTypeOf<Message>().toHaveProperty('attachments')
    })
})
