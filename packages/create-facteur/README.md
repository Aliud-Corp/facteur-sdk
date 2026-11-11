# create-facteur

Write your first Facteur email test. In an empty folder, `npm create facteur` asks which test tool you use and which inbox to receive in, then writes a test that waits for a mail and reads its code.

It needs Node 22 or later. It has no dependency and makes no network call: it writes files and prints what to do next.

## Use

```sh
npm create facteur
```

Two questions, each with a default:

- the test tool, `playwright` or `cypress` (default `playwright`);
- the id of the inbox your tests receive in, shown on the Inboxes screen of the application.

Without questions, for a script or a CI job:

```sh
npm create facteur -- --yes --framework playwright --inbox abcd1234
```

| Option | Does |
| --- | --- |
| `--framework <tool>` | `playwright` or `cypress`. Another value is refused. |
| `--inbox <id>` | The id of the inbox, written in the test. |
| `--dir <folder>` | The folder to write in, `.` by default. A lone argument does the same. |
| `--yes` | Asks nothing and takes the defaults for what the options leave out. Without `--inbox`, the test names `your-inbox-id` and fails until you replace it. |

## What it writes

| Tool | Files |
| --- | --- |
| `playwright` | `tests/signup.spec.ts` |
| `cypress` | `cypress.config.mjs`, `cypress/support/e2e.js`, `cypress/e2e/signup.cy.js` |

The test uses [`playwright-facteur`](https://www.npmjs.com/package/playwright-facteur) or [`cypress-facteur`](https://www.npmjs.com/package/cypress-facteur). It prints an address that belongs to the test, waits for a mail sent there and checks that the mail carries a one-time code. Replace the line that prints the address with whatever makes your application send the mail.

It never overwrites. If one of the files exists, it writes none of them and says which one. For Cypress it also stops when the folder already has a `cypress.config.js`, `cypress.config.ts` or `cypress.config.cjs`, because Cypress refuses two config files.

## After it

It prints three lines:

1. the install command (`npm i -D playwright-facteur @playwright/test`, or `npm i -D cypress-facteur cypress`);
2. the API key, in `FACTEUR_API_KEY`, in the environment of the process that runs the tests. Create it under Settings, API keys; a key that reads and writes mail is enough. The command writes no key into any file;
3. the command that runs the test.

## Licence

MIT.
