import { describe, expect, it, vi } from 'vitest'

import { configManager } from '@/config'
import { QualityGate } from '@/core'
import { PHASE } from '@/constants'
import type { Config } from '@/types'

import {
  buildEmptyResponse,
  buildErrorResponse,
  runQualityFixForFiles,
  toToolResponse
} from '@/server/qualityFixHandlers'

const minimalConfig: Config = {
  projectRoot: '/tmp/quality-gate-test-root',
  phase1Timeout: 30_000,
  phase2Timeout: 300_000,
  enableI18nRules: false,
  fixers: {
    eslint: true,
    curlyBraces: true,
    singleLineArrow: true,
    prettier: true,
    jsonValidator: true
  }
}

describe('qualityFixHandlers', () => {
  it('buildEmptyResponse marks complete success', () => {
    const r = buildEmptyResponse(2, 'a.md, b.json')

    expect(r.phase).toBe(PHASE.COMPLETE)
    expect(r.success).toBe(true)
    expect(r.message).toContain('Skipped 2')
    expect(r.message).toContain('a.md')
  })

  it('buildErrorResponse carries CONFIG_INVALID', () => {
    const r = buildErrorResponse('missing root')

    expect(r.success).toBe(false)
    expect(r.error?.code).toBe('CONFIG_INVALID')
    expect(r.error?.message).toBe('missing root')
  })

  it('toToolResponse wraps JSON text content', () => {
    const r = buildEmptyResponse(0, '')
    const wrapped = toToolResponse(r)

    expect(wrapped.content).toHaveLength(1)

    const block = wrapped.content[0]

    if (block === undefined) throw new Error('expected wrapped content')

    expect(block.type).toBe('text')
    expect(block.text).toContain('"success": true')
  })

  it('runQualityFixForFiles returns empty response when only non-code paths are given', async () => {
    const r = await runQualityFixForFiles(['README.md', 'x.json'])

    expect(r.success).toBe(true)
    expect(r.phase).toBe(PHASE.COMPLETE)
    expect(r.message).toMatch(/No code files/)
  })

  it('runQualityFixForFiles returns error payload when config load fails', async () => {
    vi.spyOn(configManager, 'load').mockImplementationOnce(() => {
      throw new Error('config boom')
    })

    const r = await runQualityFixForFiles(['some.ts'])

    expect(r.success).toBe(false)
    expect(r.error?.message).toBe('config boom')

    vi.restoreAllMocks()
  })

  it('appends skipped-file notice when code paths and non-code paths are mixed', async () => {
    vi.spyOn(configManager, 'load').mockReturnValue(minimalConfig)
    vi.spyOn(QualityGate.prototype, 'run').mockResolvedValue({
      phase: PHASE.LOCAL,
      success: true,
      message: 'Phase 1 complete',
      fixed: { eslint: 0, curlyBraces: 0, singleLineArrow: 0, prettier: 0, json: 0 },
      remaining: [],
      timing: { phase1: '1ms', total: '1ms' }
    })

    const r = await runQualityFixForFiles(['/any/path/file.ts', 'readme.md'])

    expect(r.message.startsWith('Phase 1 complete')).toBe(true)
    expect(r.message).toMatch(/Skipped 1/)
    expect(r.message).toMatch(/non-code/)

    vi.restoreAllMocks()
  })

  it('stringifies non-Error rejections in runQualityFixForFiles', async () => {
    vi.spyOn(configManager, 'load').mockReturnValue(minimalConfig)
    vi.spyOn(QualityGate.prototype, 'run').mockRejectedValue('plain string failure')

    const r = await runQualityFixForFiles(['file.ts'])

    expect(r.success).toBe(false)
    expect(r.error?.message).toBe('plain string failure')

    vi.restoreAllMocks()
  })
})
