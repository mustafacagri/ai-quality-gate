import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { QualityGate } from '@/core/QualityGate'
import { DEFAULT_FIXER_CONFIG, type Config } from '@/types'

describe('QualityGate (phase1 integration)', () => {
  it('runs phase1 in check mode on a clean file', async () => {
    const config: Config = {
      projectRoot: process.cwd(),
      phase1Timeout: 120_000,
      phase2Timeout: 300_000,
      enableI18nRules: false,
      fixers: { ...DEFAULT_FIXER_CONFIG }
    }
    const gate = new QualityGate(config)
    const file = path.join(process.cwd(), 'src/utils/codeFileFilter.ts')

    const result = await gate.run([file], { phase1Mode: 'check', phases: 'phase1' })

    expect(result.success).toBe(true)
    expect(result.phase).toBe('local')
  }, 120_000)
})
