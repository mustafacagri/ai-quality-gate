/**
 * AI Quality Gate - Constants
 * Barrel Export - Single Source of Truth
 */

// Severity Levels
export { SEVERITY } from './severity'
export type { Severity } from './severity'

// Phase Names
export { PHASE } from './phases'
export type { Phase } from './phases'

// Fixer Types
export { FIXER_TYPE } from './fixers'
export type { FixerType } from './fixers'

// Code Quality Limits
export { FILE_LIMITS, FUNCTION_LIMITS, CLASS_LIMITS, DUPLICATION_LIMITS, CODE_QUALITY_LIMITS } from './quality-limits'
export type { CodeQualityLimits } from './quality-limits'

// SonarQube Constants
export { SONAR_SEVERITY, SONAR_TASK_STATUS } from './sonarqube'
export type { SonarSeverity, SonarTaskStatus } from './sonarqube'

// Supported File Extensions
export { SUPPORTED_CODE_EXTENSIONS, isSupportedExtension } from './extensions'

// Lintable Extensions
export { LINTABLE_EXTENSIONS, isLintableFile } from './extensions'

// JSON Extensions
export { JSON_EXTENSIONS, isJsonFile, I18N_LOCALE_PATTERNS, isI18nLocaleFile } from './extensions'

// Regex Patterns
export { DEPRECATED_PATTERN, TYPESCRIPT_ERROR_PATTERN } from './patterns'

// Rule Names
export { RULE_NAMES, CUSTOM_RULE_PREFIX, formatCustomRuleId } from './rules'

// ESLint discovery (project root)
export { ESLINT_PROJECT_ROOT_CONFIG_FILENAMES } from './eslintConfigFilenames'

// Config file names (v2)
export { CONFIG_FILE_NAMES } from './config-files'
export { PROJECT_ROOT_MARKER_FILES } from './project-root'

// CLI exit codes
export { EXIT_CODE } from './exit-codes'
export type { ExitCode } from './exit-codes'
