import { describe, expect, it, vi } from 'vitest'

import { QualityGate } from '@/core/QualityGate'
import { RULE_NAMES } from '@/constants/rules'
import { baseConfig, emptyFix, mockTransactionManager } from '@/core/fixtures/gateFixtures'

describe('QualityGate', () => {
  it('calls transaction rollback when phase 1 fails', async () => {
    const rollback = vi.fn().mockResolvedValue(undefined)
    const mockTm = mockTransactionManager(rollback)

    const phase1 = {
      run: vi.fn().mockResolvedValue({
        passed: false,
        fixed: emptyFix(),
        issues: [
          {
            rule: RULE_NAMES.TYPESCRIPT,
            file: 'a.ts',
            line: 1,
            message: 'error',
            severity: 'error' as const
          }
        ]
      })
    }

    const phase2 = {
      isConfigured: () => false,
      run: vi.fn()
    }

    const gate = new QualityGate(baseConfig(), {
      transactionManager: mockTm,
      phase1,
      phase2
    })

    const result = await gate.run(['src/a.ts'])

    expect(result.success).toBe(false)
    expect(result.message).toMatch(/TypeScript: 1 issue in a\.ts/)
    expect(result.fixedCount).toBe(0)
    expect(result.attempted).toBeUndefined()
    expect(rollback).toHaveBeenCalledTimes(1)
  })

  it('keeps the phase 1 edits and commits when phase 2 finds issues', async () => {
    const rollback = vi.fn().mockResolvedValue(undefined)
    const mockTm = mockTransactionManager(rollback)

    const phase1 = {
      run: vi.fn().mockResolvedValue({
        passed: true,
        fixed: { ...emptyFix(), eslint: 2 },
        issues: []
      })
    }

    const phase2 = {
      isConfigured: () => true,
      run: vi.fn().mockResolvedValue({
        passed: false,
        issues: [
          {
            rule: 'sonarqube',
            file: 'b.ts',
            line: 2,
            message: 'issue',
            severity: 'error' as const
          }
        ]
      })
    }

    const gate = new QualityGate(baseConfig(), {
      transactionManager: mockTm,
      phase1,
      phase2
    })

    const result = await gate.run(['src/b.ts'])

    expect(result.success).toBe(false)
    expect(result.phase).toBe('server')
    expect(result.fixedCount).toBe(2)
    expect(result.fixed.eslint).toBe(2)
    expect(result.attempted).toBeUndefined()
    expect(result.remaining.map(issue => issue.rule)).toEqual(['sonarqube'])
    expect(result.message).toMatch(/^Kept 2 auto-fixes\./)
    expect(rollback).not.toHaveBeenCalled()
  })

  it('keeps attempted edits when a later phase throws and the rollback succeeds', async () => {
    const rollback = vi.fn().mockResolvedValue(undefined)
    const mockTm = mockTransactionManager(rollback)

    const gate = new QualityGate(baseConfig(), {
      transactionManager: mockTm,
      phase1: {
        run: vi.fn().mockResolvedValue({
          passed: true,
          fixed: { ...emptyFix(), eslint: 2, json: 1 },
          issues: []
        })
      },
      phase2: { isConfigured: () => true, run: vi.fn().mockRejectedValue(new Error('phase 2 exploded')) }
    })

    const result = await gate.run(['src/b.ts'])

    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('UNEXPECTED_ERROR')
    expect(result.fixedCount).toBe(0)
    expect(result.attemptedCount).toBe(2)
    expect(result.attempted?.eslint).toBe(2)
    expect(result.attempted?.json).toBe(0)
    expect(rollback).toHaveBeenCalledTimes(1)
  })

  it('includes structured error when phase 2 fails due to Sonar infrastructure', async () => {
    const rollback = vi.fn().mockResolvedValue(undefined)
    const mockTm = mockTransactionManager(rollback)

    const phase1 = {
      run: vi.fn().mockResolvedValue({
        passed: true,
        fixed: emptyFix(),
        issues: []
      })
    }

    const phase2 = {
      isConfigured: () => true,
      run: vi.fn().mockResolvedValue({
        passed: false,
        issues: [
          {
            rule: 'sonarqube',
            file: '',
            line: 0,
            message: 'SonarQube analysis failed: x',
            severity: 'error' as const
          }
        ],
        phaseError: { code: 'SONAR_API_ERROR' as const, message: 'issues API rejected' }
      })
    }

    const gate = new QualityGate(baseConfig(), {
      transactionManager: mockTm,
      phase1,
      phase2
    })

    const result = await gate.run(['src/b.ts'])

    expect(result.success).toBe(false)
    expect(result.message).toMatch(/Phase 2 \(SonarQube\) failed due to a server or network error/)
    expect(result.error?.code).toBe('SONAR_API_ERROR')
    expect(result.error?.message).toBe('issues API rejected')
  })

  it('returns configuration error when phase 2 only requested but Sonar is not configured', async () => {
    const rollback = vi.fn().mockResolvedValue(undefined)
    const mockTm = mockTransactionManager(rollback)

    const phase1 = {
      run: vi.fn()
    }

    const phase2 = {
      isConfigured: () => false,
      run: vi.fn()
    }

    const gate = new QualityGate(baseConfig(), {
      transactionManager: mockTm,
      phase1,
      phase2
    })

    const result = await gate.run(['src/a.ts'], { phases: 'phase2' })

    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('CONFIG_INVALID')
    expect(phase1.run).not.toHaveBeenCalled()
    expect(phase2.run).not.toHaveBeenCalled()
    expect(rollback).not.toHaveBeenCalled()
  })

  it('returns ROLLBACK_FAILED when rollback throws after phase 1 failure', async () => {
    const rollback = vi.fn().mockRejectedValue(new Error('rollback failed'))
    const mockTm = mockTransactionManager(rollback)

    const phase1 = {
      run: vi.fn().mockResolvedValue({
        passed: false,
        fixed: emptyFix(),
        issues: [{ rule: RULE_NAMES.TYPESCRIPT, file: 'a.ts', line: 1, message: 'e', severity: 'error' as const }]
      })
    }

    const gate = new QualityGate(baseConfig(), {
      transactionManager: mockTm,
      phase1,
      phase2: { isConfigured: () => false, run: vi.fn() }
    })

    const result = await gate.run(['src/a.ts'])

    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('ROLLBACK_FAILED')
    expect(result.error?.message).toContain('rollback failed')
  })

  it('returns UNEXPECTED_ERROR when phase 1 throws and rollback succeeds', async () => {
    const rollback = vi.fn().mockResolvedValue(undefined)
    const mockTm = mockTransactionManager(rollback)

    const gate = new QualityGate(baseConfig(), {
      transactionManager: mockTm,
      phase1: { run: vi.fn().mockRejectedValue(new Error('phase boom')) },
      phase2: { isConfigured: () => false, run: vi.fn() }
    })

    const result = await gate.run(['src/a.ts'])

    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('UNEXPECTED_ERROR')
    expect(result.error?.message).toBe('phase boom')
    expect(rollback).toHaveBeenCalled()
  })

  it('returns ROLLBACK_FAILED when phase 1 throws and rollback also fails', async () => {
    const rollback = vi.fn().mockRejectedValue(new Error('rollback x'))
    const mockTm = mockTransactionManager(rollback)

    const gate = new QualityGate(baseConfig(), {
      transactionManager: mockTm,
      phase1: { run: vi.fn().mockRejectedValue(new Error('phase boom')) },
      phase2: { isConfigured: () => false, run: vi.fn() }
    })

    const result = await gate.run(['src/a.ts'])

    expect(result.error?.code).toBe('ROLLBACK_FAILED')
  })

  it('uses default phase 1 summary when failure has no issues', async () => {
    const rollback = vi.fn().mockResolvedValue(undefined)
    const mockTm = mockTransactionManager(rollback)

    const gate = new QualityGate(baseConfig(), {
      transactionManager: mockTm,
      phase1: { run: vi.fn().mockResolvedValue({ passed: false, fixed: emptyFix(), issues: [] }) },
      phase2: { isConfigured: () => false, run: vi.fn() }
    })

    const result = await gate.run(['src/a.ts'])

    expect(result.message).toContain('Local analysis found issues')
  })

  it('summarizes mixed ESLint, TypeScript, custom, and JSON issues', async () => {
    const rollback = vi.fn().mockResolvedValue(undefined)
    const mockTm = mockTransactionManager(rollback)

    const phase1 = {
      run: vi.fn().mockResolvedValue({
        passed: false,
        fixed: emptyFix(),
        issues: [
          { rule: RULE_NAMES.TYPESCRIPT, file: 'a.ts', line: 1, message: 'ts', severity: 'error' as const },
          { rule: RULE_NAMES.ESLINT, file: 'b.ts', line: 2, message: 'es', severity: 'error' as const },
          { rule: 'custom:rule1', file: 'c.ts', line: 3, message: 'cu', severity: 'error' as const },
          { rule: 'json/schema', file: 'd.json', line: 1, message: 'js', severity: 'error' as const }
        ]
      })
    }

    const gate = new QualityGate(baseConfig(), {
      transactionManager: mockTm,
      phase1,
      phase2: { isConfigured: () => false, run: vi.fn() }
    })

    const result = await gate.run(['x'])

    expect(result.message).toMatch(/TypeScript/)
    expect(result.message).toMatch(/ESLint/)
    expect(result.message).toMatch(/Custom rules/)
    expect(result.message).toMatch(/JSON/)
  })

  it('formats issue location as multiple files when file is unknown', async () => {
    const rollback = vi.fn().mockResolvedValue(undefined)
    const mockTm = mockTransactionManager(rollback)

    const phase1 = {
      run: vi.fn().mockResolvedValue({
        passed: false,
        fixed: emptyFix(),
        issues: [{ rule: RULE_NAMES.ESLINT, file: 'unknown', line: 0, message: 'm', severity: 'error' as const }]
      })
    }

    const gate = new QualityGate(baseConfig(), {
      transactionManager: mockTm,
      phase1,
      phase2: { isConfigured: () => false, run: vi.fn() }
    })

    const result = await gate.run(['z'])

    expect(result.message).toMatch(/multiple files/)
  })

  it('skips phase 2 when phases option is phase1 only', async () => {
    const rollback = vi.fn().mockResolvedValue(undefined)
    const mockTm = mockTransactionManager(rollback)

    const phase2Run = vi.fn()

    const gate = new QualityGate(baseConfig(), {
      transactionManager: mockTm,
      phase1: {
        run: vi.fn().mockResolvedValue({
          passed: true,
          fixed: { ...emptyFix(), eslint: 2 },
          issues: []
        })
      },
      phase2: { isConfigured: () => true, run: phase2Run }
    })

    const result = await gate.run(['src/a.ts'], { phases: 'phase1' })

    expect(result.success).toBe(true)
    expect(phase2Run).not.toHaveBeenCalled()
    expect(result.message).toMatch(/Phase 1 complete/)
  })

  it('reports rolled-back edits as attempted and keeps durable fix counts at zero', async () => {
    const rollback = vi.fn().mockResolvedValue(undefined)
    const mockTm = mockTransactionManager(rollback)

    const phase1 = {
      run: vi.fn().mockResolvedValue({
        passed: false,
        fixed: { eslint: 3, curlyBraces: 0, singleLineArrow: 0, prettier: 0, json: 1 },
        issues: [
          { rule: RULE_NAMES.TYPESCRIPT, file: 'a.ts', line: 1, message: 'e', severity: 'error' as const },
          { rule: RULE_NAMES.TYPESCRIPT, file: 'b.ts', line: 2, message: 'e', severity: 'error' as const }
        ]
      })
    }

    const gate = new QualityGate(baseConfig(), {
      transactionManager: mockTm,
      phase1,
      phase2: { isConfigured: () => false, run: vi.fn() }
    })

    const result = await gate.run(['src/a.ts'])

    expect(result.totalIssues).toBe(2)
    expect(result.remainingCount).toBe(2)
    expect(result.fixedCount).toBe(0)
    expect(result.fixed.eslint).toBe(0)
    expect(result.attemptedCount).toBe(3)
    expect(result.attempted?.eslint).toBe(3)
    expect(result.attempted?.json).toBe(0)
  })

  it('returns ROLLBACK_FAILED when phase 2 only fails and rollback throws', async () => {
    const rollback = vi.fn().mockRejectedValue(new Error('rb'))
    const mockTm = mockTransactionManager(rollback)

    const gate = new QualityGate(baseConfig(), {
      transactionManager: mockTm,
      phase1: { run: vi.fn() },
      phase2: {
        isConfigured: () => true,
        run: vi.fn().mockResolvedValue({
          passed: false,
          issues: [{ rule: 's', file: 'f', line: 1, message: 'm', severity: 'error' as const }]
        })
      }
    })

    const result = await gate.run(['x.ts'], { phases: 'phase2' })

    expect(result.error?.code).toBe('ROLLBACK_FAILED')
  })
})
