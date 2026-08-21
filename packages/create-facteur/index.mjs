#!/usr/bin/env node
/**
 * `npm create facteur@latest` — from an empty directory to a test that passes.
 *
 * The first minute of an integration is the one that decides, and it is currently spent
 * on plumbing: pick a framework, install it, find the base URL, write the wait, guess
 * where the key goes. None of that teaches anything about the product, and every reader
 * does it identically.
 *
 * So this writes it. What it does **not** do is anything clever: no network call, no
 * account creation, no key minting. It asks two questions, copies two files, and prints
 * the three lines that follow. A scaffolder that talks to an API is a scaffolder that
 * fails behind a proxy, and the failure lands on somebody's very first minute with us.
 *
 * Deliberately dependency-free, like everything else we publish: `node:readline` asks the
 * questions, `node:fs` writes the files.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stdin, stdout, argv, exit } from 'node:process';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = join(HERE, 'templates');

/** What a caller can decide without being asked, so CI can run this unattended. */
function fromArguments(args) {
  const read = (name) => {
    const flag = `--${name}`;
    const index = args.indexOf(flag);
    if (index >= 0 && args[index + 1] && !args[index + 1].startsWith('--')) {
      return args[index + 1];
    }
    const inline = args.find((one) => one.startsWith(`${flag}=`));
    return inline ? inline.slice(flag.length + 1) : undefined;
  };

  return {
    framework: read('framework'),
    inbox: read('inbox'),
    directory: read('dir') ?? args.find((one) => !one.startsWith('--')),
    yes: args.includes('--yes') || args.includes('-y'),
  };
}

const FRAMEWORKS = {
  playwright: {
    file: 'signup.spec.ts',
    template: 'playwright.txt',
    install: 'npm i -D @playwright/test && npx playwright install chromium',
    run: 'npx playwright test',
  },
  cypress: {
    file: 'cypress/e2e/signup.cy.js',
    template: 'cypress.txt',
    install: 'npm i -D cypress',
    run: 'npx cypress run',
  },
};

async function ask(question, fallback) {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = (await rl.question(question)).trim();
    return answer || fallback;
  } finally {
    rl.close();
  }
}

const options = fromArguments(argv.slice(2));
const target = resolve(options.directory ?? '.');

/*
 * Two questions, and both have a default that works. A scaffolder that interrogates
 * somebody for two minutes is a scaffolder they abandon.
 */
const framework =
  options.framework ??
  (options.yes ? 'playwright' : await ask('Framework — playwright or cypress? [playwright] ', 'playwright'));

if (!FRAMEWORKS[framework]) {
  console.error(`\n  Unknown framework: ${framework}. Pick playwright or cypress.\n`);
  exit(1);
}

const inbox =
  options.inbox ??
  (options.yes
    ? 'your-inbox-id'
    : await ask('Inbox id — copy it from the Inboxes screen [your-inbox-id] ', 'your-inbox-id'));

const choice = FRAMEWORKS[framework];
const destination = join(target, choice.file);

if (existsSync(destination)) {
  console.error(`\n  ${choice.file} already exists here. Nothing was written.\n`);
  exit(1);
}

const body = readFileSync(join(TEMPLATES, choice.template), 'utf8')
  .replaceAll('__INBOX__', inbox)
  .trimStart();

mkdirSync(dirname(destination), { recursive: true });
writeFileSync(destination, body);

/*
 * The env file is written only if it is missing, and it carries no key: a scaffolder that
 * writes a placeholder key into a file people commit has done harm, not work.
 */
const envPath = join(target, '.env.example');
if (!existsSync(envPath)) {
  writeFileSync(envPath, 'FACTEUR_API_KEY=\n');
}

console.log(`
  Written: ${choice.file}

  Next, in this order:

    1. ${choice.install}
    2. export FACTEUR_API_KEY=fk_...      (Settings → API keys, read-only is enough)
    3. ${choice.run}

  The test waits for an email sent to ${inbox}.inbox.facteur.eu and reads the
  one-time code out of it. Point your application at the address it prints.
`);
