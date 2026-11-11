/**
 * The tag that makes a test's address its own: the part after the `+` in `test+<tag>@<inbox domain>`.
 *
 * Three things keep one test from reading another's mail:
 * - the title of the test and a short hash of its spec file and full path (the describe blocks and the title), so two tests of
 *   one describe, or two tests with one title in two files, do not share an address;
 * - the attempt number, so a test that Cypress retries does not read the mail its first attempt received;
 * - the run, so a suite that keeps its inbox between runs does not read the mail of the previous run.
 *
 * The tag is computed from the test's own path every time it is asked. It is stored on nothing: the context
 * object of a `describe` is shared by every test inside it, which is where a stored tag goes wrong.
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
    /** Cypress's `Cypress.spec.relative`: the spec file, which `titlePath` does not hold. */
    file: string
    /** Cypress's `Cypress.currentTest.titlePath`: the describe blocks, then the title. */
    titlePath: string[]
    /** Cypress's `Cypress.currentRetry`: 0 on the first attempt. */
    retry: number
    /** One value for the whole run (`FACTEUR_RUN`, set by `facteurTasks`). */
    runId: string
}

export function tagFor({ file, titlePath, retry, runId }: TagParts): string {
    const title = titlePath[titlePath.length - 1] ?? ''
    return `${slug(title)}-${shortHash([file, ...titlePath].join('›'))}-r${retry}-${runId}`
}
