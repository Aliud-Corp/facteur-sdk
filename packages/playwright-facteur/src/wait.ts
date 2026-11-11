import type { TestInfo } from '@playwright/test'

/** The API holds a wait for five minutes at most. */
const MAX_WAIT_MS = 300_000
/** Left to the test after the wait, to write the failure message inside the test's timeout. */
const MARGIN_MS = 2_000

/**
 * How long to hold when the caller does not say: what is left of the test's timeout, less two seconds,
 * so that the failure written is the plugin's (what did arrive) and not Playwright's own timeout message.
 * `testInfo.timeout` is 0 when timeouts are off; the ceiling alone applies then.
 */
export function boundedWait(testInfo: Pick<TestInfo, 'timeout'>, startedAt: number, asked?: number, now = Date.now()): number {
    const left = testInfo.timeout > 0 ? testInfo.timeout - (now - startedAt) - MARGIN_MS : MAX_WAIT_MS
    const ceiling = Math.max(1_000, Math.min(left, MAX_WAIT_MS))
    return asked === undefined ? ceiling : Math.max(1, Math.min(asked, ceiling))
}
