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
  ESLINT: 'eslint'
} as const

/** Prefix for `Issue.rule` from config `customRules` (e.g. `custom:no-console`) */
export const CUSTOM_RULE_PREFIX = 'custom:' as const

export function formatCustomRuleId(ruleId: string): string {
  return `${CUSTOM_RULE_PREFIX}${ruleId}`
}
