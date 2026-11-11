import { describe, expect, it } from 'vitest'
import { slug, tagFor } from './tag.js'

const base = { titlePath: ['', 'chromium', 'login.spec.ts', 'sends a code'], title: 'sends a code', parallelIndex: 0, retry: 0, runId: 'm1abc' }

describe('slug', () => {
    it('keeps lower-case letters and digits, and joins the rest with single dashes', () => {
        expect(slug('Sends a CODE: 2FA (v2)!')).toBe('sends-a-code-2fa-v2')
    })

    it('cuts at the limit without leaving a dash at the end', () => {
        const cut = slug('a'.repeat(23) + ' bbbbbbbb', 24)
        expect(cut.length).toBeLessThanOrEqual(24)
        expect(cut.endsWith('-')).toBe(false)
    })

    it('never returns an empty string', () => {
        expect(slug('???')).toBe('test')
    })
})

describe('tagFor', () => {
    it('gives the same tag to the same test', () => {
        expect(tagFor(base)).toBe(tagFor({ ...base }))
    })

    it('differs from one attempt to the next, so a retried test cannot read the mail of its first attempt', () => {
        expect(tagFor({ ...base, retry: 1 })).not.toBe(tagFor(base))
    })

    it('differs from one worker slot to another, so two parallel tests do not share a tag', () => {
        expect(tagFor({ ...base, parallelIndex: 1 })).not.toBe(tagFor(base))
    })

    it('differs from one run to the next, so a run does not read the mail of the previous one in a kept inbox', () => {
        expect(tagFor({ ...base, runId: 'm1abd' })).not.toBe(tagFor(base))
    })

    it('differs for two tests that share a title in two files', () => {
        expect(tagFor({ ...base, titlePath: ['', 'chromium', 'signup.spec.ts', 'sends a code'] })).not.toBe(tagFor(base))
    })

    it('stays a valid, short local-part suffix, even for a long title', () => {
        const tag = tagFor({ ...base, title: 'x'.repeat(300), parallelIndex: 12, retry: 3 })
        expect(tag).toMatch(/^[a-z0-9-]+$/)
        expect(`test+${tag}`.length).toBeLessThanOrEqual(64)
    })
})
