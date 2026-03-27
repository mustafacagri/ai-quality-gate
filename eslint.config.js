/**
 * ESLint Configuration for ai-quality-gate package
 * ESLint 9 Flat Config Format
 *
 * STRATEGY: Use plugin recommended configs for MAXIMUM coverage
 * - SonarJS: ~200 rules (security, bugs, code smell)
 * - Unicorn: ~130 rules (best practices)
 * - TypeScript: ~100 rules
 * - ESLint Core: ~110 rules
 * - Import: ~46 rules (import/export)
 * - Promise: ~17 rules (async/await)
 * - Node.js (n): ~41 rules (Node.js best practices)
 * - RegExp: ~82 rules (regex best practices)
 * TOTAL: ~700+ rules!
 */

import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import sonarjs from 'eslint-plugin-sonarjs'
import unicorn from 'eslint-plugin-unicorn'
import unusedImports from 'eslint-plugin-unused-imports'
import prettier from 'eslint-plugin-prettier/recommended'
import importPlugin from 'eslint-plugin-import'
import promisePlugin from 'eslint-plugin-promise'
import nPlugin from 'eslint-plugin-n'
import regexpPlugin from 'eslint-plugin-regexp'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Load overrides from rules.json
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rulesData = JSON.parse(fs.readFileSync(path.join(__dirname, 'src/eslint/rules.json'), 'utf-8'))

// Build overrides with prefixes
const sonarjsOverrides = {}
if (rulesData.sonarjsOverrides)
  for (const [rule, value] of Object.entries(rulesData.sonarjsOverrides))
    if (!rule.startsWith('_')) sonarjsOverrides[`sonarjs/${rule}`] = value

const unicornOverrides = {}
if (rulesData.unicornOverrides)
  for (const [rule, value] of Object.entries(rulesData.unicornOverrides))
    if (!rule.startsWith('_')) unicornOverrides[`unicorn/${rule}`] = value

const typescriptRules = {}
if (rulesData.typescript)
  for (const [rule, value] of Object.entries(rulesData.typescript))
    typescriptRules[`@typescript-eslint/${rule}`] = value

const typescriptTypeAwareRules = {}
if (rulesData.typescriptTypeAware)
  for (const [rule, value] of Object.entries(rulesData.typescriptTypeAware))
    typescriptTypeAwareRules[`@typescript-eslint/${rule}`] = value

const eslintRules = {}
if (rulesData.eslintStrict)
  for (const [rule, value] of Object.entries(rulesData.eslintStrict))
    if (!rule.startsWith('_')) eslintRules[rule] = value

export default tseslint.config(
  // ═══════════════════════════════════════════════════════════════════════════
  // Base configs
  // ═══════════════════════════════════════════════════════════════════════════
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  prettier,

  // ═══════════════════════════════════════════════════════════════════════════
  // TypeScript files - ALL RULES (~700+)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: {
      sonarjs,
      unicorn,
      'unused-imports': unusedImports,
      import: importPlugin,
      promise: promisePlugin,
      n: nPlugin,
      regexp: regexpPlugin
    },
    settings: {
      // eslint-plugin-import settings for TypeScript
      'import/resolver': {
        typescript: true,
        node: true
      }
    },
    rules: {
      // ═══════════════════════════════════════════════════════════════════════
      // SonarJS - ~200 rules (security, bugs, code smell)
      // ═══════════════════════════════════════════════════════════════════════
      ...sonarjs.configs.recommended.rules,
      ...sonarjsOverrides,
      'sonarjs/os-command': 'off', // MCP server needs child_process

      // ═══════════════════════════════════════════════════════════════════════
      // Unicorn - ~130 rules (best practices)
      // ═══════════════════════════════════════════════════════════════════════
      ...unicorn.configs.recommended.rules,
      ...unicornOverrides,
      'unicorn/no-process-exit': 'off', // MCP server shutdown
      'unicorn/no-array-callback-reference': 'off', // Too strict
      'unicorn/no-array-sort': 'off', // toSorted requires Node 20+

      // ═══════════════════════════════════════════════════════════════════════
      // Import - ~46 rules (import/export best practices)
      // ═══════════════════════════════════════════════════════════════════════
      ...importPlugin.configs?.recommended?.rules,
      'import/no-unresolved': 'off', // TypeScript handles this
      'import/named': 'off', // TypeScript handles this
      'import/namespace': 'off', // TypeScript handles this
      'import/default': 'off', // TypeScript handles this
      'import/export': 'error',
      'import/no-duplicates': 'error',
      'import/no-named-as-default': 'warn',
      'import/no-named-as-default-member': 'warn',
      'import/no-mutable-exports': 'error',
      'import/first': 'error',
      'import/newline-after-import': 'error',
      'import/no-absolute-path': 'error',
      'import/no-useless-path-segments': 'error',
      'import/no-self-import': 'error',
      'import/no-cycle': 'warn',

      // ═══════════════════════════════════════════════════════════════════════
      // Promise - ~17 rules (async/await best practices)
      // ═══════════════════════════════════════════════════════════════════════
      ...promisePlugin.configs.recommended.rules,

      // ═══════════════════════════════════════════════════════════════════════
      // Node.js (n) - ~41 rules (Node.js best practices)
      // ═══════════════════════════════════════════════════════════════════════
      ...nPlugin.configs.recommended.rules,
      'n/no-missing-import': 'off', // TypeScript handles this
      'n/no-missing-require': 'off', // TypeScript handles this
      'n/no-unpublished-import': 'off', // We use devDependencies
      'n/no-unsupported-features/node-builtins': 'off', // Target is modern Node
      'n/hashbang': 'off', // Not needed for MCP server
      'n/no-process-exit': 'off', // Needed for MCP server shutdown

      // ═══════════════════════════════════════════════════════════════════════
      // RegExp - ~82 rules (regex best practices)
      // ═══════════════════════════════════════════════════════════════════════
      ...regexpPlugin.configs.recommended.rules,

      // ═══════════════════════════════════════════════════════════════════════
      // ESLint strict rules (~55)
      // ═══════════════════════════════════════════════════════════════════════
      ...eslintRules,

      // ═══════════════════════════════════════════════════════════════════════
      // TypeScript rules (~100)
      // ═══════════════════════════════════════════════════════════════════════
      'no-shadow': 'off',
      'no-empty-function': 'off',
      'no-useless-constructor': 'off',
      'consistent-return': 'off',
      ...typescriptRules,
      ...typescriptTypeAwareRules,

      // ═══════════════════════════════════════════════════════════════════════
      // Unused imports auto-fix
      // ═══════════════════════════════════════════════════════════════════════
      'unused-imports/no-unused-imports': 'error',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // JavaScript files
  // ═══════════════════════════════════════════════════════════════════════════
  {
    files: ['**/*.js', '**/*.mjs'],
    plugins: {
      sonarjs,
      unicorn,
      'unused-imports': unusedImports,
      import: importPlugin,
      promise: promisePlugin,
      n: nPlugin,
      regexp: regexpPlugin
    },
    rules: {
      ...sonarjs.configs.recommended.rules,
      ...sonarjsOverrides,
      ...unicorn.configs.recommended.rules,
      ...unicornOverrides,
      ...promisePlugin.configs.recommended.rules,
      ...nPlugin.configs.recommended.rules,
      'n/no-missing-import': 'off',
      'n/no-missing-require': 'off',
      'n/no-unpublished-import': 'off',
      ...regexpPlugin.configs.recommended.rules,
      ...eslintRules,
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Config file merge layer — Record<string, unknown> needs bracket access (TS4111)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    files: ['src/config/configFile.ts', 'src/config/configFile.test.ts'],
    rules: {
      'dot-notation': 'off',
      'prefer-destructuring': 'off'
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Vitest unit tests — temp dirs, longer test functions, relaxed Sonar noise
  // ═══════════════════════════════════════════════════════════════════════════
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-magic-numbers': 'off',
      'import/first': 'off',
      'max-lines-per-function': 'off',
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/publicly-writable-directories': 'off',
      'unicorn/no-useless-undefined': 'off',
      'unicorn/prefer-event-target': 'off'
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Ignores
  // ═══════════════════════════════════════════════════════════════════════════
  {
    ignores: ['dist/**', 'node_modules/**', 'test-fixtures/**', 'src/eslint/*.mjs', 'src/eslint/*.js']
  }
)
