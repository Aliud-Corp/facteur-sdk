import { defineConfig } from 'vitest/config'

// Generated code is not tested (doctrine 5.6). Tests sit next to the code (`src/**/*.test.ts`),
// or in `test/` when they run against the stack from a sandbox install.
export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
        exclude: ['node_modules', 'dist', 'src/generated/**'],
    },
})
