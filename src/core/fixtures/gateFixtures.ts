/**
 * What the QualityGate tests share: a config that points nowhere, an empty summary, and a transaction manager
 * whose rollback the test controls.
 */

import { vi } from 'vitest'

import type { TransactionManager } from '@/core/TransactionManager'
import { DEFAULT_FIXER_CONFIG, type Config, type Transaction } from '@/types'

export { emptyFixSummary as emptyFix } from '@/utils/fixSummary'

export const baseConfig = (): Config => ({
  projectRoot: '/tmp/aqg-project',
  phase1Timeout: 30_000,
  phase2Timeout: 300_000,
  enableI18nRules: false,
  fixers: { ...DEFAULT_FIXER_CONFIG }
})

export const mockTransactionManager = (rollback: () => Promise<void>): TransactionManager => {
  const mockTx: Transaction = {
    recordChange: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback
  }

  return {
    begin: () => mockTx
  } as unknown as TransactionManager
}
