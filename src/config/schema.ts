/**
 * Configuration Schema
 * Zod validation schemas and environment variable definitions
 */

import { z } from 'zod'

// ═══════════════════════════════════════════════════════════════════════════
// Environment Variable Names
// ═══════════════════════════════════════════════════════════════════════════

export const ENV_KEYS = {
  /** Optional absolute or relative path to `.quality-gate.yaml` / `.quality-gate.json` (skips discovery) */
  QUALITY_GATE_CONFIG: 'QUALITY_GATE_CONFIG',
  /** Optional override; when unset, project root is inferred (walk up from cwd for `package.json` / `tsconfig.json`) */
  PROJECT_ROOT: 'PROJECT_ROOT',
  SONAR_HOST_URL: 'SONAR_HOST_URL',
  SONAR_TOKEN: 'SONAR_TOKEN',
  SONAR_PROJECT_KEY: 'SONAR_PROJECT_KEY',
  SONAR_SCANNER_PATH: 'SONAR_SCANNER_PATH',
  PHASE1_TIMEOUT: 'PHASE1_TIMEOUT',
  PHASE2_TIMEOUT: 'PHASE2_TIMEOUT',
  // Feature flags
  ENABLE_I18N_RULES: 'ENABLE_I18N_RULES'
} as const

export type EnvKey = (typeof ENV_KEYS)[keyof typeof ENV_KEYS]

// ═══════════════════════════════════════════════════════════════════════════
// Default Values
// ═══════════════════════════════════════════════════════════════════════════

export const CONFIG_DEFAULTS = {
  /** Phase 1 timeout (TypeScript + ESLint) - 30 seconds */
  PHASE1_TIMEOUT: 30_000,
  /** Phase 2 timeout (SonarQube) - 5 minutes for large monorepos */
  PHASE2_TIMEOUT: 300_000
} as const

// ═══════════════════════════════════════════════════════════════════════════
// Zod Schema
// ═══════════════════════════════════════════════════════════════════════════

const FixerConfigPartialSchema = z.object({
  curlyBraces: z.boolean().optional(),
  eslint: z.boolean().optional(),
  jsonValidator: z.boolean().optional(),
  prettier: z.boolean().optional(),
  singleLineArrow: z.boolean().optional()
})

export const FixerConfigSchema = FixerConfigPartialSchema.default({}).transform(p => ({
  curlyBraces: p.curlyBraces ?? true,
  eslint: p.eslint ?? true,
  jsonValidator: p.jsonValidator ?? true,
  prettier: p.prettier ?? true,
  singleLineArrow: p.singleLineArrow ?? true
}))

const CustomRuleSchema = z.object({
  id: z.string().min(1),
  message: z.string().min(1),
  pattern: z.string().min(1),
  severity: z.enum(['error', 'info', 'warning'])
})

export const ConfigSchema = z.object({
  /** Set by merge + `ConfigManager.ensureProjectRoot` before parse (file, env, or `findProjectRoot`) */
  projectRoot: z.string().min(1),

  // Optional (Phase 2 - SonarQube Server)
  sonarHostUrl: z.url().optional(),
  sonarToken: z.string().min(1).optional(),
  sonarProjectKey: z.string().min(1).optional(),
  sonarScannerPath: z.string().optional(),

  // Timeouts with defaults
  phase1Timeout: z.number().positive().default(CONFIG_DEFAULTS.PHASE1_TIMEOUT),
  phase2Timeout: z.number().positive().default(CONFIG_DEFAULTS.PHASE2_TIMEOUT),

  // Feature flags
  /** Enable i18n rules (no-literal-string) - default false for non-i18n projects */
  enableI18nRules: z.boolean().default(false),

  /** Phase 1 tool toggles (defaults: all enabled) */
  fixers: FixerConfigSchema,

  /** Optional regex-based rules (rule id appears as `custom:<id>` in issues) */
  customRules: z.array(CustomRuleSchema).optional()
})

export type ConfigInput = z.input<typeof ConfigSchema>
export type ConfigOutput = z.output<typeof ConfigSchema>
