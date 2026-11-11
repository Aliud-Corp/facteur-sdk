import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// The base is the ESLint setup of a React front-end
// (`js.configs.recommended`, `typescript-eslint` recommended, `no-explicit-any` as an error),
// without the React and Tailwind rules, which have no object here. No `--max-warnings` ceiling
// (doctrine 6.6): a new package has no debt to cap, so a warning fails the lint.
// `src/generated/` is excluded (doctrine 5.6).
export default tseslint.config(
    { ignores: ['dist', 'src/generated/'] },
    {
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        files: ['**/*.{ts,js}'],
        languageOptions: {
            ecmaVersion: 2022,
            globals: globals.node,
        },
        rules: {
            '@typescript-eslint/no-explicit-any': 'error',
        },
    },
)
