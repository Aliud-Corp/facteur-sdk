import { defineConfig } from 'vitest/config'

// Unit tests sit next to the code (`src/**/*.test.ts`). The consumer project under `test/consumer/` is played by
// Cypress in a sandbox install, against a running stack, never by Vitest.
export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
        exclude: ['node_modules', 'dist', 'test/consumer/**'],
    },
})
