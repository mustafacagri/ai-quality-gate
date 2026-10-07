/**
 * Spots a run that keeps failing the same way. An AI that is told what is wrong and changes nothing will get the
 * same answer forever; after a few identical failures it is told to stop and ask the human.
 */

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import type { QualityFixResponse } from '@/types'
import { ERROR_CODE } from '@/constants/errors'

/** Identical failures in a row that count as persistent. */
export const PERSISTENT_FAILURE_THRESHOLD = 3

/** Runs remembered at once. The oldest are forgotten first. */
const MAX_TRACKED_RUNS = 100

interface Attempt {
  readonly signature: string
  readonly count: number
}

const contentOf = (file: string): string => {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return '\u0000missing'
  }
}

/** The files as they are now plus every finding. Any edit to a file, or any change in the findings, changes it. */
const signatureOf = (files: readonly string[], projectRoot: string, response: QualityFixResponse): string => {
  const hash = createHash('sha256')
  // A finding can be in a file nobody selected, such as a type error in an import. Editing that file is progress too.
  const named = response.remaining
    .map(issue => issue.file)
    .filter(file => file.length > 0)
    .map(file => path.resolve(projectRoot, file))
  const tracked = [...new Set([...files, ...named])].sort((left, right) => left.localeCompare(right))

  for (const file of tracked) hash.update(`${file}\u0000${contentOf(file)}\u0000`)

  const findings = response.remaining.map(
    issue => `${issue.rule}|${issue.file}|${String(issue.line)}|${String(issue.column ?? '')}|${issue.message}`
  )

  findings.sort((left, right) => left.localeCompare(right))
  hash.update(findings.join('\n'))
  hash.update(`\u0000${response.error?.code ?? ''}\u0000${response.phase}`)

  return hash.digest('hex')
}

export class FailureTracker {
  private readonly attempts = new Map<string, Attempt>()

  /** Forgets every run. */
  reset(): void {
    this.attempts.clear()
  }

  /**
   * @param files The files of the run, as paths relative to `projectRoot` or absolute.
   * @returns How many failures in a row, identical in files and findings, this run makes. 0 when it succeeded.
   */
  record(files: readonly string[], projectRoot: string, response: QualityFixResponse): number {
    const resolved = files.map(file => path.resolve(projectRoot, file)).sort((left, right) => left.localeCompare(right))
    const key = resolved.join('\u0000')

    if (response.success) {
      this.attempts.delete(key)

      return 0
    }

    const signature = signatureOf(resolved, projectRoot, response)
    const previous = this.attempts.get(key)
    const count = previous?.signature === signature ? previous.count + 1 : 1

    this.attempts.delete(key)
    this.attempts.set(key, { signature, count })

    if (this.attempts.size > MAX_TRACKED_RUNS) {
      const oldest = this.attempts.keys().next().value

      if (oldest !== undefined) this.attempts.delete(oldest)
    }

    return count
  }
}

/** Marks a response that is the Nth identical failure in a row, once N reaches the threshold. */
export const markPersistentFailure = (response: QualityFixResponse, attempts: number): void => {
  if (attempts < PERSISTENT_FAILURE_THRESHOLD || response.error !== undefined) return

  response.error = {
    code: ERROR_CODE.PERSISTENT_FAILURE,
    message: `The same ${String(response.remaining.length)} issue(s) came back unchanged ${String(attempts)} times in a row.`,
    details: { attempts }
  }
  response.message = `Stop retrying and ask the human: ${response.message}`
}
