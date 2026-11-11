import { readFileSync } from 'node:fs'
import { defineConfig } from '@hey-api/openapi-ts'

// The public API document is written by the back (doctrine 5.3) and read here; the client is
// generated and committed (doctrine 5.6). `FACTEUR_OPENAPI_INPUT` names the document: the task that
// regenerates the client passes it, and the negative control of the drift guard passes a copy with
// an operation planted in it. There is no default path, because this file is also published in a
// repository that holds the packages and not the API document.
const path = process.env.FACTEUR_OPENAPI_INPUT
if (!path) throw new Error('FACTEUR_OPENAPI_INPUT must name the OpenAPI document of the public API (task packages:openapi passes it)')
const document = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>

// The document carries the development host in `servers[0].url`. Even with `baseUrl: false`, the
// generator writes that host in the `ClientOptions` type, and that type ends up in the published
// `.d.ts`. The generator reads the document without `servers`, so no host is written anywhere.
delete document.servers

export default defineConfig({
    input: document,
    output: {
        path: 'src/generated',
        // `tsc` emits ES modules for Node, which resolves `./client.js` and not `./client`.
        importFileExtension: '.js',
    },
    plugins: [
        {
            name: '@hey-api/client-fetch',
            // No default address in the client: the facade owns the production one.
            baseUrl: false,
        },
    ],
})
