/**
 * A type check only means something for a file the checked program contains.
 * `tsc` passes a `.ts` file that no tsconfig includes, and `vue-tsc` a `.vue` one, without a word.
 */

import path from 'node:path'

import { RULE_NAMES, SEVERITY, UNKNOWN_ISSUE_LINE } from '@/constants'
import type { Issue } from '@/types'

/** Absolute paths from `--listFilesOnly` output. Anything that is not a path to a file is ignored. */
export const parseListedFiles = (stdout: string): Set<string> =>
  new Set(
    stdout
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0 && path.isAbsolute(line))
      .map(line => path.resolve(line))
  )

export const notCheckedIssue = (file: string, configPath: string, projectRoot: string, checker: string): Issue => ({
  rule: RULE_NAMES.TYPESCRIPT,
  file,
  line: UNKNOWN_ISSUE_LINE,
  message: `Not included by ${path.relative(projectRoot, configPath) || configPath}: ${checker} did not type check this file. Add it to the tsconfig include.`,
  severity: SEVERITY.ERROR
})
