import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { TransactionManager } from '@/core/TransactionManager'
import { Phase1Local } from '@/phases/Phase1Local'
import { DEFAULT_FIXER_CONFIG, type Config } from '@/types'

describe('Phase1Local', () => {
  it('returns success when only JSON files are present and validation passes', async () => {
    const config: Config = {
      projectRoot: process.cwd(),
      phase1Timeout: 120_000,
      phase2Timeout: 300_000,
      enableI18nRules: false,
      fixers: { ...DEFAULT_FIXER_CONFIG }
    }
    const phase1 = new Phase1Local(config)
    const tm = new TransactionManager()
    const tx = tm.begin()

    const result = await phase1.run([path.join(process.cwd(), 'package.json')], tx, { phase1Mode: 'check' })

    expect(result.passed).toBe(true)
  }, 120_000)
})
