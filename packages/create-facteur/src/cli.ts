#!/usr/bin/env node
/**
 * `npm create facteur`: from an empty folder to a first test that receives a mail.
 *
 * No network call, no account, no key: it asks two questions, writes the test files of the tool, and prints
 * the three lines that follow. A scaffolder that talks to an API fails behind a proxy, on somebody's first minute.
 */
import { createInterface } from 'node:readline'
import { run } from './scaffold.js'

/** Asks one question; an input that ends without an answer gives an empty one, which means the default. */
function ask(question: string): Promise<string> {
    return new Promise((resolve) => {
        const rl = createInterface({ input: process.stdin, output: process.stdout })
        rl.once('close', () => resolve(''))
        rl.question(question, (answer) => {
            resolve(answer)
            rl.close()
        })
    })
}

process.exitCode = await run(process.argv.slice(2), {
    ask,
    out: (text) => console.log(text),
    err: (text) => console.error(text),
    cwd: process.cwd(),
})
