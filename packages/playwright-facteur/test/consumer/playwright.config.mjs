// The project of a customer who installed `playwright-facteur`, played in a sandbox by
// the maintainers' end-to-end spec, against a running stack. It reads its stack from the
// environment: FACTEUR_API_KEY, FACTEUR_BASE_URL and FACTEUR_INBOX (the plan has one inbox).
// Two workers, so that the specs of `parallel` really run together.
import { defineConfig } from '@playwright/test'

export default defineConfig({
    testDir: 'specs',
    testMatch: '*.spec.mjs',
    workers: 2,
    timeout: 30_000,
    reporter: [['list'], ['json', { outputFile: process.env.REPORT_FILE ?? 'report.json' }]],
})
