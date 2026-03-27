import { describe, expect, it, vi, beforeEach } from 'vitest'

import { DEFAULT_FIXER_CONFIG, type Config } from '@/types'

const mockRun = vi.fn()

vi.mock('@/config', () => ({
  configManager: {
    load: vi.fn(
      (): Config => ({
        projectRoot: process.cwd(),
        phase1Timeout: 30_000,
        phase2Timeout: 300_000,
        enableI18nRules: false,
        fixers: { ...DEFAULT_FIXER_CONFIG }
      })
    )
  }
}))

vi.mock('@/core', () => ({
  QualityGate: class {
    run = mockRun
  }
}))

import { runQualityFixForFiles } from '@/server/qualityFixHandlers'

describe('runQualityFixForFiles (mixed paths)', () => {
  beforeEach(() => {
    mockRun.mockReset()
    mockRun.mockResolvedValue({
      success: true,
      phase: 'local',
      message: 'Gate ok',
      fixed: { eslint: 0, curlyBraces: 0, singleLineArrow: 0, prettier: 0, json: 0 },
      remaining: [],
      timing: { phase1: '1ms', total: '2ms' }
    })
  })

  it('appends skipped non-code file count to the gate message', async () => {
    const r = await runQualityFixForFiles(['src/utils/codeFileFilter.ts', 'README.md'])

    expect(mockRun).toHaveBeenCalled()
    expect(r.message).toContain('Skipped 1')
    expect(r.message).toContain('non-code')
  })
})
