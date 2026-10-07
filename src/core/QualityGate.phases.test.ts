import { describe, expect, it, vi } from 'vitest'

import { QualityGate } from '@/core/QualityGate'
import { RollbackError } from '@/core/TransactionManager'
import { baseConfig, emptyFix, mockTransactionManager } from '@/core/fixtures/gateFixtures'

const rejectAfter = (ms: number, message: string): Promise<never> =>
  new Promise((_resolve, reject) => {
    setTimeout(() => {
      reject(new Error(message))
    }, ms)
  })

describe('QualityGate reports an error against the phase it happened in', () => {
  it('names the server when Phase 2 throws and the rollback that follows fails too', async () => {
    const gate = new QualityGate(baseConfig(), {
      transactionManager: mockTransactionManager(
        vi.fn().mockRejectedValue(new RollbackError([{ file: '/tmp/aqg-project/a.ts', message: 'EACCES' }], []))
      ),
      phase1: { run: vi.fn().mockResolvedValue({ passed: true, fixed: { ...emptyFix(), eslint: 1 }, issues: [] }) },
      phase2: { isConfigured: () => true, run: vi.fn().mockRejectedValue(new Error('sonar client exploded')) }
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await gate.run(['/tmp/aqg-project/a.ts'])

    consoleError.mockRestore()
    expect(result.error?.code).toBe('ROLLBACK_FAILED')
    expect(result.phase).toBe('server')
  })

  it('names the server for an unexpected Phase 2 error that was rolled back, and keeps its time', async () => {
    const gate = new QualityGate(baseConfig(), {
      transactionManager: mockTransactionManager(vi.fn().mockResolvedValue(undefined)),
      phase1: { run: vi.fn().mockResolvedValue({ passed: true, fixed: emptyFix(), issues: [] }) },
      phase2: { isConfigured: () => true, run: vi.fn(() => rejectAfter(25, 'boom')) }
    })

    const result = await gate.run(['/tmp/aqg-project/a.ts'])

    expect(result.error?.code).toBe('UNEXPECTED_ERROR')
    expect(result.phase).toBe('server')
    expect(result.timing.phase2).toMatch(/^\d+ms$/)
  })

  it('names the local phase, with its time, when Phase 1 itself throws', async () => {
    const gate = new QualityGate(baseConfig(), {
      transactionManager: mockTransactionManager(vi.fn().mockResolvedValue(undefined)),
      phase1: { run: vi.fn(() => rejectAfter(25, 'boom')) },
      phase2: { isConfigured: () => false, run: vi.fn() }
    })

    const result = await gate.run(['/tmp/aqg-project/a.ts'])

    expect(result.error?.code).toBe('UNEXPECTED_ERROR')
    expect(result.phase).toBe('local')
    expect(result.timing.phase1).not.toBe('0ms')
  })
})
