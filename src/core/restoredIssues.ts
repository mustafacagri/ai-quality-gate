/**
 * After a failed phase rolls the files back, `remaining` has to describe the files on disk.
 * Issues found on the auto-fixed output point at lines of text that no longer exists.
 */

import { UNKNOWN_ISSUE_LINE } from '@/constants'
import type { Issue } from '@/types'

const issueKey = (issue: Issue): string => `${issue.file}\u0000${issue.rule}\u0000${issue.message}`

const withoutLocation = (issue: Issue): Issue => ({
  rule: issue.rule,
  file: issue.file,
  line: UNKNOWN_ISSUE_LINE,
  message: issue.message,
  severity: issue.severity
})

const groupByKey = (issues: readonly Issue[]): Map<string, Issue[]> => {
  const groups = new Map<string, Issue[]>()

  for (const issue of issues) {
    const key = issueKey(issue)
    const group = groups.get(key)

    if (group === undefined) groups.set(key, [issue])
    else group.push(issue)
  }

  return groups
}

/**
 * @param rejected Issues found on the auto-fixed output that was rolled back.
 * @param restored Issues found on the restored files by a read-only check.
 * @returns Every rejected issue exactly once, so no blocker is dropped.
 * An issue gets its on-disk location only when the restored files have exactly as many issues with the same
 * file, rule and message. Fewer or more is ambiguous: an auto-fix may have removed one occurrence and not
 * another, and nothing says which, so the surplus is reported without a location. Findings that only the
 * restored files have are not part of the result, because an auto-fix removes them.
 */
export const selectIssuesOnRestoredFiles = (rejected: readonly Issue[], restored: readonly Issue[]): Issue[] => {
  const restoredByKey = groupByKey(restored)
  const located: Issue[] = []
  const unlocated: Issue[] = []

  for (const [key, group] of groupByKey(rejected)) {
    const candidates = restoredByKey.get(key) ?? []

    if (candidates.length === group.length) located.push(...candidates)
    else unlocated.push(...group.map(issue => withoutLocation(issue)))
  }

  return [...located, ...unlocated]
}
