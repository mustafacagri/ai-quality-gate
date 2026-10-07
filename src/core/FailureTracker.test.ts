import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { FailureTracker, PERSISTENT_FAILURE_THRESHOLD, markPersistentFailure } from '@/core/FailureTracker'
import type { Issue, QualityFixResponse } from '@/types'

let dir: string
let file: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-failure-tracker-'))
  file = path.join(dir, 'a.ts')
  fs.writeFileSync(file, 'export const a = 1\n', 'utf8')
})

afterEach(() => fs.rmSync(dir, { force: true, recursive: true }))

const issue = (message: string, line = 1): Issue => ({ rule: 'eqeqeq', file, line, message, severity: 'error' })

const failure = (...issues: Issue[]): QualityFixResponse => ({
  phase: 'local',
  success: false,
  message: 'ESLint: issues',
  fixed: { eslint: 0, curlyBraces: 0, singleLineArrow: 0, prettier: 0, json: 0 },
  remaining: issues,
  timing: { phase1: '1ms', total: '1ms' }
})

const success = (): QualityFixResponse => ({ ...failure(), success: true, remaining: [] })

describe('FailureTracker', () => {
  it('counts identical failures in a row', () => {
    const tracker = new FailureTracker()

    expect([1, 2, 3].map(() => tracker.record([file], dir, failure(issue('==', 1))))).toEqual([1, 2, 3])
  })

  it('starts over when the file changes, because the caller did something', () => {
    const tracker = new FailureTracker()

    tracker.record([file], dir, failure(issue('==')))
    tracker.record([file], dir, failure(issue('==')))
    fs.writeFileSync(file, 'export const a = 2\n', 'utf8')

    expect(tracker.record([file], dir, failure(issue('==')))).toBe(1)
  })

  it('starts over when the findings change', () => {
    const tracker = new FailureTracker()

    tracker.record([file], dir, failure(issue('==')))

    expect(tracker.record([file], dir, failure(issue('==', 5)))).toBe(1)
    expect(tracker.record([file], dir, failure(issue('==', 5), issue('other')))).toBe(1)
  })

  it('starts over when a file named in the findings changes, even one nobody selected', () => {
    const tracker = new FailureTracker()
    const imported = path.join(dir, 'imported.ts')

    fs.writeFileSync(imported, 'export const x = 1\n', 'utf8')

    const withImported = failure({ ...issue('Type error from an import'), file: imported })

    tracker.record([file], dir, withImported)
    tracker.record([file], dir, withImported)
    fs.writeFileSync(imported, 'export const x = 2\n', 'utf8')

    expect(tracker.record([file], dir, withImported)).toBe(1)
  })

  it('forgets the run once it succeeds', () => {
    const tracker = new FailureTracker()

    tracker.record([file], dir, failure(issue('==')))
    tracker.record([file], dir, failure(issue('==')))

    expect(tracker.record([file], dir, success())).toBe(0)
    expect(tracker.record([file], dir, failure(issue('==')))).toBe(1)
  })

  it('does not mix up different sets of files, nor relative with absolute paths of the same file', () => {
    const tracker = new FailureTracker()
    const other = path.join(dir, 'b.ts')

    fs.writeFileSync(other, 'export const b = 1\n', 'utf8')
    tracker.record([file], dir, failure(issue('==')))

    expect(tracker.record([other], dir, failure(issue('==')))).toBe(1)
    expect(tracker.record(['a.ts'], dir, failure(issue('==')))).toBe(2)
    expect(tracker.record([other, file], dir, failure(issue('==')))).toBe(1)
    expect(tracker.record([file, other], dir, failure(issue('==')))).toBe(2)
  })

  it('treats a file that cannot be read as one more state, not as a crash', () => {
    const tracker = new FailureTracker()

    fs.rmSync(file)

    expect(tracker.record([file], dir, failure(issue('==')))).toBe(1)
    expect(tracker.record([file], dir, failure(issue('==')))).toBe(2)
  })
})

describe('markPersistentFailure', () => {
  it('leaves a response alone until the threshold is reached', () => {
    const response = failure(issue('=='))

    markPersistentFailure(response, PERSISTENT_FAILURE_THRESHOLD - 1)

    expect(response.error).toBeUndefined()
    expect(response.message).toBe('ESLint: issues')
  })

  it('tells the caller to stop and ask the human at the threshold', () => {
    const response = failure(issue('=='), issue('x'))

    markPersistentFailure(response, PERSISTENT_FAILURE_THRESHOLD)

    expect(response.error).toEqual({
      code: 'PERSISTENT_FAILURE',
      message: 'The same 2 issue(s) came back unchanged 3 times in a row.',
      details: { attempts: PERSISTENT_FAILURE_THRESHOLD }
    })
    expect(response.message).toBe('Stop retrying and ask the human: ESLint: issues')
  })

  it('does not replace an error that says more', () => {
    const response = { ...failure(issue('==')), error: { code: 'ROLLBACK_FAILED' as const, message: 'm' } }

    markPersistentFailure(response, 10)

    expect(response.error.code).toBe('ROLLBACK_FAILED')
    expect(response.message).toBe('ESLint: issues')
  })
})
