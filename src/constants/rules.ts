/**
 * Rule Names - Single Source of Truth
 * Rule identifiers used in Issue.rule field
 */

/**
 * TypeScript rule names
 */
export const RULE_NAMES = {
  TYPESCRIPT: 'typescript',
  TYPESCRIPT_DEPRECATED: 'typescript:deprecated',
  ESLINT: 'eslint',
  /** `@vue/compiler-sfc` structural and script-compile failures */
  VUE_SFC: 'vue-sfc',
  PRETTIER: 'prettier'
} as const

/** Issue line when a tool reports a failure without a source location. */
export const UNKNOWN_ISSUE_LINE = 0

/** Prefix for `Issue.rule` from config `customRules` (e.g. `custom:no-console`) */
export const CUSTOM_RULE_PREFIX = 'custom:' as const

export function formatCustomRuleId(ruleId: string): string {
  return `${CUSTOM_RULE_PREFIX}${ruleId}`
}
