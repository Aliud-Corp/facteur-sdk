import { defineConfig } from 'vitest/config'

// Unit tests sit next to the code (`src/**/*.test.ts`). The generated tests are played in a sandbox against a running stack, never by Vitest.
export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
        exclude: ['node_modules', 'dist'],
    },
})
