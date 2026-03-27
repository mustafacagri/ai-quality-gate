/**
 * Embedded ESLint Configuration (Flat Config - ESLint 9+)
 * Used by MCP Server for customer projects
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
 *
 * ESM Format - Enables modern ESM-only plugins
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tseslint from 'typescript-eslint'
import sonarjs from 'eslint-plugin-sonarjs'
import unicorn from 'eslint-plugin-unicorn'
import unusedImports from 'eslint-plugin-unused-imports'
import importPlugin from 'eslint-plugin-import'
import promisePlugin from 'eslint-plugin-promise'
import nPlugin from 'eslint-plugin-n'
import regexpPlugin from 'eslint-plugin-regexp'
import i18nextPlugin from 'eslint-plugin-i18next'
import prettierConfig from 'eslint-config-prettier'

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load rule overrides from JSON
const rulesPath = path.join(__dirname, 'rules.json')
const rulesData = JSON.parse(fs.readFileSync(rulesPath, 'utf8'))

// Feature flags from environment
const ENABLE_I18N_RULES = process.env.ENABLE_I18N_RULES === 'true'

// Build sonarjs rule OVERRIDES with prefix
const sonarjsOverrides = {}
if (rulesData.sonarjsOverrides)
  for (const [rule, value] of Object.entries(rulesData.sonarjsOverrides))
    if (!rule.startsWith('_')) sonarjsOverrides[`sonarjs/${rule}`] = value

// Build unicorn rule OVERRIDES with prefix
const unicornOverrides = {}
if (rulesData.unicornOverrides)
  for (const [rule, value] of Object.entries(rulesData.unicornOverrides))
    if (!rule.startsWith('_')) unicornOverrides[`unicorn/${rule}`] = value

// ESLint strict rules (omit JSON metadata keys such as `_comment_*`)
const eslintRules = {}
if (rulesData.eslintStrict)
  for (const [rule, value] of Object.entries(rulesData.eslintStrict))
    if (!rule.startsWith('_')) eslintRules[rule] = value

// TypeScript rules from rules.json (non-type-aware)
const typescriptRules = {}
if (rulesData.typescript)
  for (const [rule, value] of Object.entries(rulesData.typescript))
    typescriptRules[`@typescript-eslint/${rule}`] = value

// TypeScript TYPE-AWARE rules (requires parserOptions.project)
const typescriptTypeAwareRules = {}
if (rulesData.typescriptTypeAware)
  for (const [rule, value] of Object.entries(rulesData.typescriptTypeAware))
    typescriptTypeAwareRules[`@typescript-eslint/${rule}`] = value

export default [
  // ═══════════════════════════════════════════════════════════════════════════
  // Ignore patterns
  // ═══════════════════════════════════════════════════════════════════════════
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/.nuxt/**', '**/coverage/**', '**/*.min.js', '**/*.min.css']
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TypeScript Recommended Type-Checked (base config)
  // ═══════════════════════════════════════════════════════════════════════════
  ...tseslint.configs.recommendedTypeChecked,

  // ═══════════════════════════════════════════════════════════════════════════
  // TypeScript files - ALL RULES (~700+)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.vue'],
    languageOptions: {
      parserOptions: {
        project: true
      }
    },
    plugins: {
      sonarjs,
      unicorn,
      'unused-imports': unusedImports,
      import: importPlugin,
      promise: promisePlugin,
      n: nPlugin,
      regexp: regexpPlugin,
      i18next: i18nextPlugin
    },
    settings: {
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
      'sonarjs/os-command': 'warn', // Allow but warn for build tools

      // ═══════════════════════════════════════════════════════════════════════
      // Unicorn - ~130 rules (best practices)
      // ═══════════════════════════════════════════════════════════════════════
      ...unicorn.configs.recommended.rules,
      ...unicornOverrides,
      'unicorn/no-process-exit': 'warn', // Allow in CLI apps
      'unicorn/no-array-callback-reference': 'off', // TypeScript guarantees function signatures
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
      // Custom: Import alias restriction (no "as" keyword for function imports)
      // ═══════════════════════════════════════════════════════════════════════
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportSpecifier[imported.name!=local.name]',
          message:
            'Import alias is not allowed. Use the original function name or rename your local function. Type assertions (as Type) are allowed.'
        }
      ],

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
      'n/hashbang': 'off', // Not always needed
      'n/no-process-exit': 'warn', // Allow in CLI apps

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
      // Unused imports (auto-fix)
      // ═══════════════════════════════════════════════════════════════════════
      'unused-imports/no-unused-imports': 'error',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

      // ═══════════════════════════════════════════════════════════════════════
      // i18next - Magic string detection (hardcoded literals)
      // Only enabled if ENABLE_I18N_RULES=true in mcp.json env
      // ═══════════════════════════════════════════════════════════════════════
      ...(ENABLE_I18N_RULES
        ? {
            'i18next/no-literal-string': [
              'warn',
              {
                mode: 'jsx-text-only', // Conservative: only JSX/Vue template text
                'jsx-attributes': { include: ['alt', 'aria-label', 'title', 'placeholder'] },
                words: { exclude: ['[A-Z_]+'] }, // Allow CONSTANT_CASE
                'should-validate-template': true
              }
            ]
          }
        : {})
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // JavaScript files (no type-aware rules)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    files: ['**/*.js', '**/*.jsx', '**/*.mjs'],
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
      // SonarJS
      ...sonarjs.configs.recommended.rules,
      ...sonarjsOverrides,
      'sonarjs/os-command': 'warn',
      // Unicorn
      ...unicorn.configs.recommended.rules,
      ...unicornOverrides,
      'unicorn/no-process-exit': 'warn',
      'unicorn/no-array-callback-reference': 'warn',
      'unicorn/no-array-sort': 'off',
      // Promise
      ...promisePlugin.configs.recommended.rules,
      // Node.js
      ...nPlugin.configs.recommended.rules,
      'n/no-missing-import': 'off',
      'n/no-missing-require': 'off',
      'n/no-unpublished-import': 'off',
      // RegExp
      ...regexpPlugin.configs.recommended.rules,
      // ESLint
      ...eslintRules,
      // Unused imports
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Prettier Integration - Disable conflicting ESLint rules
  // Must be last to override all formatting rules
  // ═══════════════════════════════════════════════════════════════════════════
  prettierConfig
]
