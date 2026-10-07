/**
 * The one place that knows what an empty `FixSummary` is and which of its fields are edits.
 * `fixed` and `attempted` in a response are both a `FixSummary`.
 */

import type { FixSummary } from '@/types'

/** The field that counts files that were validated, not edited. */
const VALIDATION_FIELD = 'json'

export const emptyFixSummary = (): FixSummary => ({
  eslint: 0,
  curlyBraces: 0,
  singleLineArrow: 0,
  prettier: 0,
  json: 0
})

/** The summary without JSON validation, which does not change a file. */
export const editsOnly = (summary: FixSummary): FixSummary => ({ ...summary, [VALIDATION_FIELD]: 0 })

/** How many edits a summary stands for. Sums every field, so a new kind of fix counts without changing this. */
export const countEdits = (summary: FixSummary): number => {
  let total = 0

  for (const field of Object.keys(summary) as (keyof FixSummary)[]) {
    if (field !== VALIDATION_FIELD) total += summary[field]
  }

  return total
}
