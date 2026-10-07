import { describe, expect, it, vi } from 'vitest'

import { RollbackError } from '@/core/TransactionManager'
import { QualityGate } from '@/core/QualityGate'
import { RULE_NAMES } from '@/constants/rules'
import { baseConfig, emptyFix, mockTransactionManager } from '@/core/fixtures/gateFixtures'
import type { Issue, Phase1RunOptions, Transaction } from '@/types'

const lintIssue = (line: number, message: string): Issue => ({
  rule: RULE_NAMES.ESLINT,
  file: '/tmp/aqg-project/a.ts',
  line,
  message,
  severity: 'error'
})

const editedAndFailed = (issues: Issue[]) => ({
  passed: false,
  fixed: { ...emptyFix(), prettier: 1 },
  issues
})

describe('QualityGate rollback reporting', () => {
  it('keeps edits Phase 1 had made when Phase 1 itself throws', async () => {
    const rollback = vi.fn().mockResolvedValue(undefined)
    const gate = new QualityGate(baseConfig(), {
      transactionManager: mockTransactionManager(rollback),
      phase1: {
        run: vi.fn().mockImplementation((_files: string[], _transaction: Transaction, options?: Phase1RunOptions) => {
          const summary = emptyFix()

          options?.onFixSummary?.(summary)
          summary.curlyBraces = 2
          summary.prettier = 1

          return Promise.reject(new Error('eslint crashed'))
        })
      },
      phase2: { isConfigured: () => false, run: vi.fn() }
    })

    const result = await gate.run(['src/b.ts'])

    expect(result.error?.code).toBe('UNEXPECTED_ERROR')
    expect(result.fixedCount).toBe(0)
    expect(result.attemptedCount).toBe(3)
    expect(result.attempted).toMatchObject({ curlyBraces: 2, prettier: 1 })
    expect(rollback).toHaveBeenCalledTimes(1)
  })

  describe('remaining issues after a rollback', () => {
    it('re-checks the restored files and reports their line numbers, not the rejected output lines', async () => {
      const rollback = vi.fn().mockResolvedValue(undefined)
      const run = vi
        .fn()
        .mockResolvedValueOnce(editedAndFailed([lintIssue(10, 'Expected ===')]))
        .mockResolvedValueOnce({
          passed: false,
          fixed: emptyFix(),
          issues: [lintIssue(1, 'Prefer const'), lintIssue(2, 'Expected ===')]
        })
      const gate = new QualityGate(baseConfig(), {
        transactionManager: mockTransactionManager(rollback),
        phase1: { run },
        phase2: { isConfigured: () => false, run: vi.fn() }
      })

      const result = await gate.run(['/tmp/aqg-project/a.ts'])

      expect(run).toHaveBeenCalledTimes(2)
      expect(run.mock.calls[1]?.[2]).toEqual({ phase1Mode: 'check' })
      expect(rollback.mock.invocationCallOrder[0]).toBeLessThan(run.mock.invocationCallOrder[1] ?? 0)
      expect(result.remaining).toEqual([lintIssue(2, 'Expected ===')])
      expect(result.remainingCount).toBe(1)
      expect(result.attemptedCount).toBe(1)
    })

    it('keeps an issue only the rejected output had, without a line it cannot back up', async () => {
      const run = vi
        .fn()
        .mockResolvedValueOnce(editedAndFailed([{ ...lintIssue(7, 'Introduced by a fixer'), column: 4 }]))
        .mockResolvedValueOnce({ passed: true, fixed: emptyFix(), issues: [] })
      const gate = new QualityGate(baseConfig(), {
        transactionManager: mockTransactionManager(vi.fn().mockResolvedValue(undefined)),
        phase1: { run },
        phase2: { isConfigured: () => false, run: vi.fn() }
      })

      const result = await gate.run(['/tmp/aqg-project/a.ts'])

      expect(result.remaining).toEqual([lintIssue(0, 'Introduced by a fixer')])
      expect(result.remaining[0]).not.toHaveProperty('column')
    })

    it('says unrestored files may still hold the attempted edits when the rollback itself fails', async () => {
      const run = vi.fn().mockResolvedValue(editedAndFailed([lintIssue(3, 'Unused')]))
      const gate = new QualityGate(baseConfig(), {
        transactionManager: mockTransactionManager(vi.fn().mockRejectedValue(new Error('restore denied'))),
        phase1: { run },
        phase2: { isConfigured: () => false, run: vi.fn() }
      })
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await gate.run(['/tmp/aqg-project/a.ts'])

      consoleError.mockRestore()
      expect(result.error?.code).toBe('ROLLBACK_FAILED')
      expect(result.error?.message).toBe('restore denied')
      expect(result.message).toContain('may still contain the edits')
      expect(result.attemptedCount).toBe(1)
      expect(run).toHaveBeenCalledTimes(1)
    })

    it('does not re-check when no rejected issue has a location to recover', async () => {
      const run = vi.fn().mockResolvedValue(editedAndFailed([lintIssue(0, 'Prettier failed')]))
      const gate = new QualityGate(baseConfig(), {
        transactionManager: mockTransactionManager(vi.fn().mockResolvedValue(undefined)),
        phase1: { run },
        phase2: { isConfigured: () => false, run: vi.fn() }
      })

      const result = await gate.run(['/tmp/aqg-project/a.ts'])

      expect(run).toHaveBeenCalledTimes(1)
      expect(result.remaining).toEqual([lintIssue(0, 'Prettier failed')])
    })

    it('tells a failed rollback apart: failing phase, what failed, and which files were not restored', async () => {
      const stuck = '/tmp/aqg-project/stuck.ts'
      const rollbackError = new RollbackError([{ file: stuck, message: 'EACCES' }], ['/tmp/aqg-project/ok.ts'])
      const gate = new QualityGate(baseConfig(), {
        transactionManager: mockTransactionManager(vi.fn().mockRejectedValue(rollbackError)),
        phase1: { run: vi.fn().mockResolvedValue(editedAndFailed([lintIssue(7, 'Expected ===')])) },
        phase2: { isConfigured: () => false, run: vi.fn() }
      })
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await gate.run(['/tmp/aqg-project/a.ts'])

      consoleError.mockRestore()
      expect(result.phase).toBe('local')
      expect(result.error).toEqual({
        code: 'ROLLBACK_FAILED',
        message: rollbackError.message,
        details: { unrestoredFiles: [stuck], restoredFiles: ['/tmp/aqg-project/ok.ts'] }
      })
      expect(result.remaining).toEqual([lintIssue(0, 'Expected ===')])
      expect(result.remainingCount).toBe(1)
      expect(result.attemptedCount).toBe(1)
      expect(result.fixedCount).toBe(0)
    })

    it('names the server as the failing phase when a Phase 2 only run cannot roll back', async () => {
      const gate = new QualityGate(baseConfig(), {
        transactionManager: mockTransactionManager(vi.fn().mockRejectedValue(new Error('restore denied'))),
        phase1: { run: vi.fn() },
        phase2: {
          isConfigured: () => true,
          run: vi.fn().mockResolvedValue({ passed: false, issues: [lintIssue(4, 'Sonar finding')] })
        }
      })
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await gate.run(['/tmp/aqg-project/a.ts'], { phases: 'phase2' })

      consoleError.mockRestore()
      expect(result.phase).toBe('server')
      expect(result.error?.code).toBe('ROLLBACK_FAILED')
      expect(result.error?.details).toBeUndefined()
      expect(result.remaining).toEqual([lintIssue(0, 'Sonar finding')])
    })

    it('does not re-check when no edit was attempted', async () => {
      const run = vi.fn().mockResolvedValue({ passed: false, fixed: emptyFix(), issues: [lintIssue(3, 'Unused')] })
      const gate = new QualityGate(baseConfig(), {
        transactionManager: mockTransactionManager(vi.fn().mockResolvedValue(undefined)),
        phase1: { run },
        phase2: { isConfigured: () => false, run: vi.fn() }
      })

      const result = await gate.run(['/tmp/aqg-project/a.ts'])

      expect(run).toHaveBeenCalledTimes(1)
      expect(result.remaining).toEqual([lintIssue(3, 'Unused')])
    })

    it('drops locations instead of guessing when the restored files cannot be re-checked', async () => {
      const run = vi
        .fn()
        .mockResolvedValueOnce(editedAndFailed([lintIssue(10, 'Expected ===')]))
        .mockRejectedValueOnce(new Error('eslint crashed'))
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      const gate = new QualityGate(baseConfig(), {
        transactionManager: mockTransactionManager(vi.fn().mockResolvedValue(undefined)),
        phase1: { run },
        phase2: { isConfigured: () => false, run: vi.fn() }
      })

      const result = await gate.run(['/tmp/aqg-project/a.ts'])

      consoleError.mockRestore()
      expect(result.success).toBe(false)
      expect(result.remaining).toEqual([lintIssue(0, 'Expected ===')])
    })
  })
})
