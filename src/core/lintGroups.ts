/**
 * ESLint cannot pick a rule set per block of one file. Vue files whose script is plain JavaScript are linted
 * in their own ESLint process, which gets the JavaScript rule set a `.js` file gets. Everything else shares one.
 */

import { isVueSfc } from '@/constants/extensions'
import { VUE_PLAIN_JS_SCRIPT, VUE_SCRIPT_LANG_ENV } from '@/constants/vue'
import { CHECK_STATUS, type CheckStatus } from '@/constants/verification'
import type { LintResult } from '@/types'
import { hasPlainJsScript } from '@/vue/scriptLanguages'

export interface LintGroup {
  readonly files: string[]
  /** Extra environment for the ESLint process that lints this group. */
  readonly env: Record<string, string>
}

export const groupLintFilesByScriptLanguage = (files: readonly string[]): LintGroup[] => {
  const plainJs = new Set(files.filter(file => isVueSfc(file) && hasPlainJsScript(file)))
  const rest = files.filter(file => !plainJs.has(file))
  const groups: LintGroup[] = []

  if (rest.length > 0) groups.push({ files: rest, env: {} })

  if (plainJs.size > 0) groups.push({ files: [...plainJs], env: { [VUE_SCRIPT_LANG_ENV]: VUE_PLAIN_JS_SCRIPT } })

  return groups
}

const worstStatus = (results: readonly LintResult[]): CheckStatus => {
  if (results.some(result => result.status === CHECK_STATUS.ERROR)) return CHECK_STATUS.ERROR

  if (results.some(result => result.status === CHECK_STATUS.FAIL)) return CHECK_STATUS.FAIL

  return CHECK_STATUS.PASS
}

export const mergeLintResults = (results: readonly LintResult[]): LintResult => {
  const status = worstStatus(results)

  return {
    passed: status === CHECK_STATUS.PASS,
    status,
    scannedFiles: results.flatMap(result => result.scannedFiles ?? []),
    hasErrors: results.some(result => result.hasErrors),
    fixedCount: results.reduce((total, result) => total + result.fixedCount, 0),
    errors: results.flatMap(result => result.errors)
  }
}
