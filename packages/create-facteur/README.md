# create-facteur

From an empty directory to a test that passes, in one command.

```sh
npm create facteur@latest
```

It asks two questions, writes one file, and prints the three lines that follow. That is
all it does: no network call, no account created, no key minted. A scaffolder that talks
to an API is a scaffolder that fails behind a corporate proxy, and that failure would land
on somebody's first minute with us.

## What you get

Two tests, and the split matters:

- **the key reaches the inbox** passes immediately, and tells you your key and your inbox
  id are right before you go looking for anything else;
- **the signup email carries a one-time code** is the real one, skipped until you wire
  your application to the address it prints. Remove one line to turn it on.

A first run that is green and honest beats a first run that fails because the scaffolder
could not know what sends your mail.

## Options

```sh
npm create facteur@latest -- --framework playwright --inbox j3k9x2mq --dir ./tests
npm create facteur@latest -- --yes
```

`--framework` takes `playwright` or `cypress`. `--inbox` is the id from the Inboxes
screen. `--yes` takes every default and asks nothing. Without them you are asked, and both
questions have a working default.

## What it writes

| | |
|---|---|
| `signup.spec.ts` or `cypress/e2e/signup.cy.js` | The two tests |
| `.env.example` | `FACTEUR_API_KEY=`, empty, and only if the file is missing |

**No key is ever written to disk.** The env file carries the name and nothing else: a
placeholder secret in a file people commit is harm, not help.

Nothing is overwritten. If the test file is already there, the command stops and says so.

## Licence

MIT.
