import { describe, expect, it } from 'vitest'
import { boundedWait } from './wait.js'

describe('boundedWait', () => {
    it('is what is left of the test timeout, less two seconds', () => {
        expect(boundedWait({ timeout: 30_000 }, 1_000, undefined, 6_000)).toBe(23_000)
    })

    it('never goes below one second, so the wait still reaches the API', () => {
        expect(boundedWait({ timeout: 30_000 }, 0, undefined, 29_500)).toBe(1_000)
    })

    it('honours a shorter wait asked by the caller, and never a longer one than the test allows', () => {
        expect(boundedWait({ timeout: 30_000 }, 0, 3_000, 0)).toBe(3_000)
        expect(boundedWait({ timeout: 30_000 }, 0, 90_000, 0)).toBe(28_000)
    })

    it('falls back to the API ceiling when the test has no timeout', () => {
        expect(boundedWait({ timeout: 0 }, 0, undefined, 0)).toBe(300_000)
    })
})
