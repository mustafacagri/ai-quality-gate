import { describe, expect, it, vi, beforeEach } from 'vitest'

import { DEFAULT_FIXER_CONFIG, type Config } from '@/types'

const mockRun = vi.fn()

vi.mock('@/config', () => ({
  configManager: {
    reset: vi.fn(),
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

import { failureTracker, runQualityFixForFiles } from '@/server/qualityFixHandlers'

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

describe('runQualityFixForFiles (persistent failure)', () => {
  const failing = {
    success: false,
    phase: 'local',
    message: 'ESLint: 1 issue in src/utils/codeFileFilter.ts',
    fixed: { eslint: 0, curlyBraces: 0, singleLineArrow: 0, prettier: 0, json: 0 },
    remaining: [
      { rule: 'eqeqeq', file: 'src/utils/codeFileFilter.ts', line: 1, message: 'Expected ===', severity: 'error' }
    ],
    timing: { phase1: '1ms', total: '2ms' }
  }

  beforeEach(() => {
    mockRun.mockReset()
    failureTracker.reset()
  })

  it('tells the caller to stop on the third identical failure, not before', async () => {
    mockRun.mockImplementation(() => Promise.resolve(structuredClone(failing)))

    const first = await runQualityFixForFiles(['src/utils/codeFileFilter.ts'])
    const second = await runQualityFixForFiles(['src/utils/codeFileFilter.ts'])
    const third = await runQualityFixForFiles(['src/utils/codeFileFilter.ts'])

    expect(first.error).toBeUndefined()
    expect(second.error).toBeUndefined()
    expect(third.error?.code).toBe('PERSISTENT_FAILURE')
    expect(third.message).toMatch(/^Stop retrying and ask the human: /)
  })
})

/** A promise that is settled from outside, so a test decides when a call ends. */
const deferred = (): { promise: Promise<void>; resolve: () => void } => {
  const handle: { settle?: () => void } = {}
  const promise = new Promise<void>(resolve => {
    handle.settle = resolve
  })

  return { promise, resolve: () => handle.settle?.() }
}

const tick = (): Promise<void> =>
  new Promise(resolve => {
    setImmediate(resolve)
  })

describe('runQualityFixForFiles (overlapping calls)', () => {
  const passing = {
    success: true,
    phase: 'local',
    message: 'ok',
    fixed: { eslint: 0, curlyBraces: 0, singleLineArrow: 0, prettier: 0, json: 0 },
    remaining: [],
    timing: { phase1: '1ms', total: '2ms' }
  }
  beforeEach(() => {
    mockRun.mockReset()
    failureTracker.reset()
  })

  it('does not start a call on a file while another call on it is still running', async () => {
    const events: string[] = []
    const first = deferred()

    mockRun
      .mockImplementationOnce(async () => {
        events.push('first start')
        await first.promise
        events.push('first end')

        return structuredClone(passing)
      })
      .mockImplementationOnce(() => {
        events.push('second start')

        return Promise.resolve(structuredClone(passing))
      })

    const firstCall = runQualityFixForFiles(['src/utils/codeFileFilter.ts'])
    const secondCall = runQualityFixForFiles(['src/utils/codeFileFilter.ts'])

    await tick()
    expect(events).toEqual(['first start'])

    first.resolve()
    await Promise.all([firstCall, secondCall])
    expect(events).toEqual(['first start', 'first end', 'second start'])
  })

  it('lets calls on different files run at the same time', async () => {
    const events: string[] = []
    const first = deferred()

    mockRun
      .mockImplementationOnce(async () => {
        events.push('first start')
        await first.promise

        return structuredClone(passing)
      })
      .mockImplementationOnce(() => {
        events.push('second start')

        return Promise.resolve(structuredClone(passing))
      })

    const firstCall = runQualityFixForFiles(['src/utils/codeFileFilter.ts'])
    const secondCall = runQualityFixForFiles(['src/utils/pathMatch.ts'])

    await secondCall
    expect(events).toEqual(['first start', 'second start'])

    first.resolve()
    await firstCall
  })
})
