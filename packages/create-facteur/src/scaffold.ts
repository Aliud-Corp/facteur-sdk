import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { INBOX_ID, TEMPLATES, TOOLS } from './templates.js'
import type { Tool } from './templates.js'

export type Options = {
    framework?: string
    inbox?: string
    dir?: string
    yes: boolean
}

/** What the command touches: the questions, the two output streams, the working folder. Tests pass their own. */
export type Io = {
    ask: (question: string) => Promise<string>
    out: (text: string) => void
    err: (text: string) => void
    cwd: string
}

export const DEFAULT_TOOL: Tool = 'playwright'
/** Written when `--yes` leaves the inbox out: the test then fails with a message that names it, instead of reaching another inbox. */
export const PLACEHOLDER_INBOX = 'your-inbox-id'

const VALUE_FLAGS = ['framework', 'inbox', 'dir']

/** The options of the command line; throws on a flag it does not know, or a value flag without its value. */
export function parseArgs(args: readonly string[]): Options {
    const options: Options = { yes: false }
    const positional: string[] = []
    for (let index = 0; index < args.length; index++) {
        const arg = args[index] as string
        if (arg === '--yes' || arg === '-y') {
            options.yes = true
        } else if (arg.startsWith('--')) {
            const [name, inline] = arg.slice(2).split(/=(.*)/s, 2) as [string, string | undefined]
            if (!VALUE_FLAGS.includes(name)) throw new Error(`Unknown option --${name}. The options are --framework, --inbox, --dir and --yes.`)
            const value = inline ?? args[++index]
            if (value === undefined || value === '' || value.startsWith('--')) throw new Error(`--${name} needs a value.`)
            options[name as 'framework' | 'inbox' | 'dir'] = value
        } else {
            positional.push(arg)
        }
    }
    if (positional.length > 1) throw new Error(`Expected one folder, got ${positional.length}: ${positional.join(' ')}.`)
    if (positional[0] !== undefined && options.dir === undefined) options.dir = positional[0]
    return options
}

const isTool = (value: string): value is Tool => (TOOLS as readonly string[]).includes(value)

/** Runs the command and returns its exit code. Writes nothing unless every check passed. */
export async function run(args: readonly string[], io: Io): Promise<number> {
    let options: Options
    try {
        options = parseArgs(args)
    } catch (error) {
        io.err(`\n  ${(error as Error).message}\n`)
        return 1
    }

    // Two questions, each with a default that works; `--yes` takes the defaults without asking.
    const framework =
        options.framework ?? (options.yes ? DEFAULT_TOOL : (await io.ask(`Test tool, ${TOOLS.join(' or ')}? [${DEFAULT_TOOL}] `)).trim() || DEFAULT_TOOL)
    if (!isTool(framework)) {
        io.err(`\n  Unknown test tool: ${framework}. Pick ${TOOLS.join(' or ')}.\n`)
        return 1
    }

    const inbox =
        options.inbox ??
        (options.yes ? PLACEHOLDER_INBOX : (await io.ask(`Inbox id, shown on the Inboxes screen [${PLACEHOLDER_INBOX}] `)).trim() || PLACEHOLDER_INBOX)
    if (!INBOX_ID.test(inbox)) {
        io.err(`\n  "${inbox}" is not an inbox id: it holds letters, digits, "-" and "_".\n`)
        return 1
    }

    const template = TEMPLATES[framework]
    const target = resolve(io.cwd, options.dir ?? '.')
    const blocking = [...template.files.map((file) => file.path), ...template.conflicts].filter((path) => existsSync(join(target, path)))
    if (blocking.length > 0) {
        io.err(`\n  ${blocking.join(', ')} already exist${blocking.length === 1 ? 's' : ''} here. Nothing was written.\n`)
        return 1
    }

    for (const file of template.files) {
        const destination = join(target, file.path)
        mkdirSync(dirname(destination), { recursive: true })
        // `wx` fails if the file appeared since the check: still no overwrite.
        writeFileSync(destination, file.content(inbox), { flag: 'wx' })
    }

    io.out(`\n  Written: ${template.files.map((file) => file.path).join(', ')}\n`)
    io.out(`  1. ${template.install}`)
    io.out('  2. export FACTEUR_API_KEY=<a key from Settings, API keys>   (in the environment of the process that runs the tests)')
    io.out(`  3. ${template.run}\n`)
    return 0
}
