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
import vueEslintParser from 'vue-eslint-parser'
import sonarjs from 'eslint-plugin-sonarjs'
import unicorn from 'eslint-plugin-unicorn'
import unusedImports from 'eslint-plugin-unused-imports'
import importPlugin from 'eslint-plugin-import'
import promisePlugin from 'eslint-plugin-promise'
import nPlugin from 'eslint-plugin-n'
import regexpPlugin from 'eslint-plugin-regexp'
import i18nextPlugin from 'eslint-plugin-i18next'
import { importAliasPlugin, IMPORT_ALIAS_RULE_ID } from './import-alias-rule.mjs'
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

// Keep aligned with VUE_SFC_EXTENSION in src/constants/extensions.ts.
const VUE_SFC_EXTENSION = '.vue'
const VUE_SFC_GLOB = '**/*.vue'

// Keep aligned with VUE_SCRIPT_LANG_ENV in src/constants/vue.ts.
// A flat config cannot choose rules per block of one file, so the gate lints Vue files whose script is plain
// JavaScript in their own ESLint process and sets this variable to `js` there.
const VUE_SCRIPT_LANG_ENV = 'AQG_VUE_SCRIPT_LANG'
const VUE_SCRIPTS_ARE_PLAIN_JS = process.env[VUE_SCRIPT_LANG_ENV] === 'js'

const scriptLintPlugins = {
  aqg: importAliasPlugin,
  sonarjs,
  unicorn,
  'unused-imports': unusedImports,
  import: importPlugin,
  promise: promisePlugin,
  n: nPlugin,
  regexp: regexpPlugin
}

const i18nLiteralRules = () => {
  if (!ENABLE_I18N_RULES) return {}

  return {
    'i18next/no-literal-string': [
      'warn',
      {
        mode: 'jsx-text-only',
        'jsx-attributes': { include: ['alt', 'aria-label', 'title', 'placeholder'] },
        words: { exclude: ['[A-Z_]+'] },
        'should-validate-template': true
      }
    ]
  }
}

const javascriptScriptRules = {
  ...sonarjs.configs.recommended.rules,
  ...sonarjsOverrides,
  'sonarjs/os-command': 'warn',
  ...unicorn.configs.recommended.rules,
  ...unicornOverrides,
  'unicorn/no-process-exit': 'warn',
  'unicorn/no-array-callback-reference': 'warn',
  'unicorn/no-array-sort': 'off',
  ...promisePlugin.configs.recommended.rules,
  ...nPlugin.configs.recommended.rules,
  'n/no-missing-import': 'off',
  'n/no-missing-require': 'off',
  'n/no-unpublished-import': 'off',
  ...regexpPlugin.configs.recommended.rules,
  ...eslintRules,
  [IMPORT_ALIAS_RULE_ID]: 'error',
  'unused-imports/no-unused-imports': 'error',
  'unused-imports/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
}

const vueScriptRules = {
  ...javascriptScriptRules,
  'unicorn/no-array-callback-reference': 'off',
  'no-shadow': 'off',
  'no-empty-function': 'off',
  'no-useless-constructor': 'off',
  'consistent-return': 'off',
  ...typescriptRules,
  '@typescript-eslint/no-unused-vars': 'off',
  // rules.json includes some @typescript-eslint rules that still need type information.
  // Vue SFCs are not in the tsc program, so those rules stay off.
  ...tseslint.configs.disableTypeChecked.rules,
  ...i18nLiteralRules()
}

// The same rules a `.js` file gets, so a plain-JS `<script>` is not held to TypeScript-only rules.
const vuePlainJsScriptRules = {
  ...javascriptScriptRules,
  ...i18nLiteralRules()
}

const vueScriptParser = {
  js: tseslint.parser,
  jsx: tseslint.parser,
  ts: tseslint.parser,
  tsx: tseslint.parser
}

// vue-eslint-parser falls back to espree for the script when no parser is given, which is what a `.js` file uses.
const vueScriptParserOptions = VUE_SCRIPTS_ARE_PLAIN_JS ? {} : { parser: vueScriptParser }

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
  ...tseslint.configs.recommendedTypeChecked.map(config => ({
    ...config,
    files: ['**/*.{ts,tsx,mts,cts}']
  })),

  // ═══════════════════════════════════════════════════════════════════════════
  // TypeScript files - ALL RULES (~700+)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: process.cwd()
      }
    },
    plugins: {
      ...scriptLintPlugins,
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
      [IMPORT_ALIAS_RULE_ID]: 'error',

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
      ...i18nLiteralRules()
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // JavaScript files (no type-aware rules)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: scriptLintPlugins,
    rules: javascriptScriptRules
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Vue SFCs — script and script setup only. Template and style are not JS.
  // Type-aware rules are off by policy: the project service does not see the virtual TypeScript Volar derives from
  // an SFC (macros, template-only imports), so they could flag correct code. Type errors come from vue-tsc.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    files: [VUE_SFC_GLOB],
    languageOptions: {
      parser: vueEslintParser,
      parserOptions: {
        ...vueScriptParserOptions,
        extraFileExtensions: [VUE_SFC_EXTENSION],
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true }
      }
    },
    plugins: {
      ...scriptLintPlugins,
      '@typescript-eslint': tseslint.plugin,
      i18next: i18nextPlugin
    },
    rules: VUE_SCRIPTS_ARE_PLAIN_JS ? vuePlainJsScriptRules : vueScriptRules
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Prettier Integration - Disable conflicting ESLint rules
  // Must be last to override all formatting rules
  // ═══════════════════════════════════════════════════════════════════════════
  prettierConfig
]
