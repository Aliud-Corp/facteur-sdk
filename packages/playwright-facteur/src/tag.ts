/**
 * The tag that makes a test's address its own: the part after the `+` in `test+<tag>@<inbox domain>`.
 *
 * Every component answers one way of reading another test's mail:
 * - the title and a short hash of its full path (project, file, describe blocks): two tests that share
 *   a title in two files do not share an address;
 * - the parallel slot: two tests running at once do not share it. The slot, not the worker index,
 *   because Playwright starts a new worker after a failure and gives it a new index, while the slot
 *   is kept; the attempt number below is then what tells the retry from the first try;
 * - the attempt number: a retried test does not read the mail its first attempt received;
 * - the run: a suite that uses a kept inbox (`FACTEUR_INBOX`) does not read the mail of the previous run.
 */

/** Lower-case letters and digits joined by single dashes, cut at `max`; never empty. */
export function slug(text: string, max = 24): string {
    const clean = text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, max)
        .replace(/-+$/, '')
    return clean || 'test'
}

/** FNV-1a over the text, in base 36: short, stable from one process to the next, not a security hash. */
function shortHash(text: string): string {
    let hash = 0x811c9dc5
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return hash.toString(36)
}

export type TagParts = {
    /** Playwright's `testInfo.titlePath`. */
    titlePath: string[]
    /** Playwright's `testInfo.title`. */
    title: string
    /** Playwright's `testInfo.parallelIndex`. */
    parallelIndex: number
    /** Playwright's `testInfo.retry`: 0 on the first attempt. */
    retry: number
    /** One value for the whole run (see `runId` in `fixtures.ts`). */
    runId: string
}

export function tagFor({ titlePath, title, parallelIndex, retry, runId }: TagParts): string {
    return `${slug(title)}-${shortHash(titlePath.join('›'))}-p${parallelIndex}r${retry}-${runId}`
}
