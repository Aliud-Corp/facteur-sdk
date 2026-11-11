import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseArgs, run } from './scaffold.js'
import type { Io } from './scaffold.js'

let cwd: string
let out: string[]
let err: string[]
let asked: string[]
let answers: string[]

const io = (): Io => ({
    cwd,
    out: (text) => out.push(text),
    err: (text) => err.push(text),
    ask: async (question) => {
        asked.push(question)
        return answers.shift() ?? ''
    },
})

beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'create-facteur-'))
    out = []
    err = []
    asked = []
    answers = []
})
afterEach(() => rmSync(cwd, { recursive: true, force: true }))

describe('the options', () => {
    it('reads the four options, with a value after a space or after "="', () => {
        expect(parseArgs(['--framework', 'cypress', '--inbox=abcd1234', '--dir', 'x', '--yes'])).toEqual({ framework: 'cypress', inbox: 'abcd1234', dir: 'x', yes: true })
    })

    it('takes a lone argument as the folder', () => {
        expect(parseArgs(['my-tests']).dir).toBe('my-tests')
    })

    it('refuses an option it does not know, and a value flag without its value', () => {
        expect(() => parseArgs(['--force'])).toThrow('Unknown option --force')
        expect(() => parseArgs(['--inbox'])).toThrow('--inbox needs a value')
        expect(() => parseArgs(['--inbox', '--yes'])).toThrow('--inbox needs a value')
    })
})

describe('--yes --framework playwright --inbox abcd1234', () => {
    it('writes the test without asking anything, with the inbox in it', async () => {
        const code = await run(['--yes', '--framework', 'playwright', '--inbox', 'abcd1234'], io())

        expect(code).toBe(0)
        expect(asked).toEqual([])
        const test = readFileSync(join(cwd, 'tests/signup.spec.ts'), 'utf8')
        expect(test).toContain("process.env.FACTEUR_INBOX ??= 'abcd1234'")
        expect(test).toContain("from 'playwright-facteur'")
        expect(err).toEqual([])
    })

    it('prints the three lines that follow: install, the key in the environment, the test command', async () => {
        await run(['--yes', '--framework', 'playwright', '--inbox', 'abcd1234'], io())

        const lines = out.join('\n').split('\n').filter((line) => /^ {2}\d\. /.test(line))
        expect(lines).toHaveLength(3)
        expect(lines[0]).toBe('  1. npm i -D playwright-facteur @playwright/test')
        expect(lines[1]).toContain('export FACTEUR_API_KEY=')
        expect(lines[2]).toBe('  3. npx playwright test')
    })

    it('writes into --dir, created if needed', async () => {
        expect(await run(['--yes', '--framework', 'playwright', '--inbox', 'abcd1234', '--dir', 'sub/tests-here'], io())).toBe(0)
        expect(existsSync(join(cwd, 'sub/tests-here/tests/signup.spec.ts'))).toBe(true)
    })
})

describe('the two questions', () => {
    it('asks for the tool and the inbox when nothing was given', async () => {
        answers = ['cypress', 'wxyz9876']

        expect(await run([], io())).toBe(0)

        expect(asked).toHaveLength(2)
        expect(readFileSync(join(cwd, 'cypress.config.mjs'), 'utf8')).toContain("process.env.FACTEUR_INBOX ??= 'wxyz9876'")
    })

    it('takes the defaults on an empty answer', async () => {
        expect(await run([], io())).toBe(0)
        expect(existsSync(join(cwd, 'tests/signup.spec.ts'))).toBe(true)
        expect(readFileSync(join(cwd, 'tests/signup.spec.ts'), 'utf8')).toContain("'your-inbox-id'")
    })

    it('does not ask what an option already says', async () => {
        answers = ['wxyz9876']
        await run(['--framework', 'playwright'], io())
        expect(asked).toHaveLength(1)
        expect(asked[0]).toContain('Inbox id')
    })
})

describe('what it refuses', () => {
    it('does not overwrite a file that exists', async () => {
        mkdirSync(join(cwd, 'tests'))
        writeFileSync(join(cwd, 'tests/signup.spec.ts'), 'mine')

        const code = await run(['--yes', '--framework', 'playwright', '--inbox', 'abcd1234'], io())

        expect(code).toBe(1)
        expect(readFileSync(join(cwd, 'tests/signup.spec.ts'), 'utf8')).toBe('mine')
        expect(err.join('')).toContain('tests/signup.spec.ts already exists here. Nothing was written.')
    })

    it('writes none of the Cypress files when one of them exists', async () => {
        mkdirSync(join(cwd, 'cypress/e2e'), { recursive: true })
        writeFileSync(join(cwd, 'cypress/e2e/signup.cy.js'), 'mine')

        expect(await run(['--yes', '--framework', 'cypress', '--inbox', 'abcd1234'], io())).toBe(1)

        expect(existsSync(join(cwd, 'cypress.config.mjs'))).toBe(false)
        expect(existsSync(join(cwd, 'cypress/support/e2e.js'))).toBe(false)
    })

    it('refuses a Cypress setup when the folder already has a config of another extension', async () => {
        writeFileSync(join(cwd, 'cypress.config.js'), 'mine')

        expect(await run(['--yes', '--framework', 'cypress', '--inbox', 'abcd1234'], io())).toBe(1)

        expect(err.join('')).toContain('cypress.config.js')
        expect(existsSync(join(cwd, 'cypress.config.mjs'))).toBe(false)
    })

    it('refuses an unknown tool, given or answered, and writes nothing', async () => {
        expect(await run(['--yes', '--framework', 'jest', '--inbox', 'abcd1234'], io())).toBe(1)
        expect(err.join('')).toContain('Unknown test tool: jest. Pick playwright or cypress.')

        answers = ['selenium']
        expect(await run([], io())).toBe(1)
        expect(existsSync(join(cwd, 'tests'))).toBe(false)
    })

    it('refuses an inbox id that would break out of the string it is written in', async () => {
        expect(await run(['--yes', '--framework', 'playwright', '--inbox', "x'; process.exit(0); '"], io())).toBe(1)
        expect(existsSync(join(cwd, 'tests'))).toBe(false)
    })
})
