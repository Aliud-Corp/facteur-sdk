import { describe, expect, it } from 'vitest'
import { slug, tagFor } from './tag.js'

const base = { file: 'cypress/e2e/signup.cy.js', titlePath: ['signup', 'sends a code'], retry: 0, runId: 'run1' }

describe('tagFor', () => {
    it('differs for two tests of the same describe', () => {
        expect(tagFor({ ...base, titlePath: ['signup', 'first'] })).not.toBe(tagFor({ ...base, titlePath: ['signup', 'second'] }))
    })

    it('differs for two tests with the same title in two describes', () => {
        expect(tagFor({ ...base, titlePath: ['a', 'same'] })).not.toBe(tagFor({ ...base, titlePath: ['b', 'same'] }))
    })

    it('differs for two tests with the same path in two files', () => {
        expect(tagFor({ ...base, file: 'cypress/e2e/a.cy.js' })).not.toBe(tagFor({ ...base, file: 'cypress/e2e/b.cy.js' }))
    })

    it('differs from one attempt to the next, so a retry does not read the mail of its first attempt', () => {
        expect(tagFor({ ...base, retry: 0 })).not.toBe(tagFor({ ...base, retry: 1 }))
    })

    it('differs from one run to the next', () => {
        expect(tagFor({ ...base, runId: 'run1' })).not.toBe(tagFor({ ...base, runId: 'run2' }))
    })

    it('is stable for one test in one attempt, so two commands of a test agree', () => {
        expect(tagFor(base)).toBe(tagFor({ ...base }))
    })

    it('is a valid local part: lower-case letters, digits and dashes', () => {
        expect(tagFor({ ...base, titlePath: ['Ça marche ?! Très bien', 'Sign-up / Sign in'] })).toMatch(/^[a-z0-9-]+$/)
    })
})

describe('slug', () => {
    it('never gives an empty text', () => {
        expect(slug('???')).toBe('test')
    })
})
