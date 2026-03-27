/**
 * Config Types - Configuration interface
 */

/** Toggle Phase 1 tools (defaults: all true). Disabling ESLint also skips lint in check mode. */
export interface FixerConfig {
  /** ESLint --fix / lint check */
  eslint: boolean
  /** AST: CurlyBracesFixer */
  curlyBraces: boolean
  /** AST: SingleLineArrowFixer */
  singleLineArrow: boolean
  /** Prettier --write */
  prettier: boolean
  /** JSON validation + i18n consistency checks */
  jsonValidator: boolean
}

export const DEFAULT_FIXER_CONFIG: FixerConfig = {
  eslint: true,
  curlyBraces: true,
  singleLineArrow: true,
  prettier: true,
  jsonValidator: true
}

/** User-defined regex checks (Phase 1), optional in `.quality-gate.yaml` */
export interface CustomRule {
  id: string
  message: string
  /** JavaScript `RegExp` source (e.g. `console\\.log\\(`) */
  pattern: string
  severity: 'error' | 'info' | 'warning'
}

export interface Config {
  projectRoot: string
  sonarHostUrl?: string | undefined
  sonarToken?: string | undefined
  sonarProjectKey?: string | undefined
  sonarScannerPath?: string | undefined
  phase1Timeout: number
  phase2Timeout: number
  /** Enable i18n rules (no-literal-string) - for projects with translation support */
  enableI18nRules: boolean
  /** Which local fixers / tools run in Phase 1 */
  fixers: FixerConfig
  /** Optional project-specific regex rules (scanned on lintable files) */
  customRules?: CustomRule[] | undefined
}
