// ESLint flat config. Goal of this PR: get a baseline lint running and
// surface (not break) the known circular imports between
// js/ui/cards.js, js/ui/pool.js, and js/ui/modals.js so they are visible
// in CI without forcing a follow-up refactor in the same change.
//
// Rules are intentionally light. Tighten in a follow-up.

import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';

export default [
    {
        ignores: ['node_modules/**', 'package-lock.json']
    },
    js.configs.recommended,
    {
        files: ['js/**/*.js'],
        plugins: { import: importPlugin },
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: { ...globals.browser }
        },
        rules: {
            // Surface cycles. Warn (not error) for now: cards <-> pool <-> modals
            // is a known and acknowledged cycle. Tightening this to `error`
            // is a follow-up that requires a small refactor.
            'import/no-cycle': ['warn', { maxDepth: 5 }],

            // Forbid prompt/confirm/alert long-term in favor of in-app modals.
            // Warn-only for now; many existing call sites.
            'no-alert': 'warn',

            // We don't want a hard error on unused vars while iterating; allow
            // the underscore-prefix convention to silence intentional ones.
            'no-unused-vars': ['warn', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_'
            }],

            // Allow console for now (used for storage error reporting).
            'no-console': 'off'
        }
    },
    {
        files: ['test/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: { ...globals.node }
        },
        rules: {
            'no-unused-vars': 'off'
        }
    }
];
