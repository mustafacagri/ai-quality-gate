/**
 * One-line summary of why Phase 1 failed, for MCP and CLI output
 * (for example "TypeScript: 2 issues in src/index.ts; ESLint: 1 issue in src/a.vue").
 */

import path from 'node:path'

import { CUSTOM_RULE_PREFIX, RULE_NAMES } from '@/constants'
import type { Issue } from '@/types'

const NO_ISSUES_SUMMARY = 'Local analysis found issues. Fix these first.'

const isTypeScriptIssue = (issue: Issue): boolean =>
  issue.rule === RULE_NAMES.TYPESCRIPT || issue.rule === RULE_NAMES.TYPESCRIPT_DEPRECATED

const isJsonIssue = (issue: Issue): boolean => issue.rule.startsWith('json/')

const isCustomIssue = (issue: Issue): boolean => issue.rule.startsWith(CUSTOM_RULE_PREFIX)

/** Everything that is not claimed by another group is an ESLint rule. */
const isEslintIssue = (issue: Issue): boolean =>
  !isTypeScriptIssue(issue) &&
  !isCustomIssue(issue) &&
  !isJsonIssue(issue) &&
  issue.rule !== RULE_NAMES.VUE_SFC &&
  issue.rule !== RULE_NAMES.PRETTIER

const formatGroup = (label: string, issues: Issue[], projectRoot: string): string => {
  const count = issues.length
  const issueWord = count === 1 ? 'issue' : 'issues'
  const file = issues[0]?.file
  let where: string

  if (file === undefined || file === 'unknown' || file.length === 0) {
    where = 'multiple files'
  } else {
    const resolved = path.isAbsolute(file) ? file : path.resolve(projectRoot, file)
    const relative = path.relative(projectRoot, resolved)

    where = relative.length > 0 && !relative.startsWith('..') ? relative : file
  }

  return `${label}: ${String(count)} ${issueWord} in ${where}`
}

export const summarizePhase1Failure = (issues: Issue[], projectRoot: string): string => {
  const groups: [string, Issue[]][] = [
    ['TypeScript', issues.filter(issue => isTypeScriptIssue(issue))],
    ['Vue', issues.filter(issue => issue.rule === RULE_NAMES.VUE_SFC)],
    ['ESLint', issues.filter(issue => isEslintIssue(issue))],
    ['Prettier', issues.filter(issue => issue.rule === RULE_NAMES.PRETTIER)],
    ['Custom rules', issues.filter(issue => isCustomIssue(issue))],
    ['JSON', issues.filter(issue => isJsonIssue(issue))]
  ]
  const segments = groups
    .filter(([, groupIssues]) => groupIssues.length > 0)
    .map(([label, groupIssues]) => formatGroup(label, groupIssues, projectRoot))

  return segments.length > 0 ? segments.join('; ') : NO_ISSUES_SUMMARY
}

/** "Kept 3 auto-fixes." when the run edited files and left the edits in place, otherwise nothing. */
export const keptEditsNotice = (kept: number): string => {
  if (kept === 0) return ''

  const noun = kept === 1 ? 'fix' : 'fixes'

  return `Kept ${String(kept)} auto-${noun}.`
}

/** Failure message for a run that kept its edits: the notice, then what is left to fix by hand. */
export const keptEditsMessage = (issues: Issue[], projectRoot: string, kept: number): string => {
  const summary = summarizePhase1Failure(issues, projectRoot)
  const notice = keptEditsNotice(kept)

  return notice === '' ? summary : `${notice} Still to fix by hand: ${summary}`
}
