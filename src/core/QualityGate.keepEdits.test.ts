import fs from 'node:fs'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { QualityGate } from '@/core/QualityGate'
import { Verifier } from '@/core/Verifier'
import { Phase1Local } from '@/phases/Phase1Local'
import { TransactionManager } from '@/core/TransactionManager'
import { DEFAULT_FIXER_CONFIG, type Config, type CustomRule } from '@/types'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(process.cwd(), 'aqg-keep-edits-'))
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(dir, { force: true, recursive: true })
})

const config = (overrides: Partial<Config> = {}): Config => ({
  projectRoot: process.cwd(),
  phase1Timeout: 120_000,
  phase2Timeout: 1,
  enableI18nRules: false,
  fixers: { ...DEFAULT_FIXER_CONFIG },
  ...overrides
})

const write = (name: string, source: string): string => {
  const file = path.join(dir, name)

  fs.writeFileSync(file, source, 'utf8')

  return file
}

/** `var` and the braces are fixable; `flag == other` is not, because `==` to `===` can change behavior. */
const mixed = `export function pick(flag, other) {
  var result = 0
  if (flag) {
    result = 1
  }
  return flag == other ? result : 0
}
`

describe('a finding the fixers cannot fix does not undo the fixes they could make', () => {
  it('keeps the edits, reports the finding, and its line points into the file as it is now', async () => {
    const file = write('mixed.js', mixed)

    const response = await new QualityGate(config()).run([file], { phases: 'phase1' })

    const onDisk = fs.readFileSync(file, 'utf8')

    expect(response.success).toBe(false)
    expect(onDisk).not.toBe(mixed)
    expect(onDisk).toContain('let result = 0')
    expect(onDisk).toContain('if (flag) result = 1')
    expect(response.fixedCount).toBeGreaterThan(0)
    expect(response.attempted).toBeUndefined()
    expect(response.message).toMatch(/^Kept \d+ auto-fixes?\./)

    const loose = response.remaining.find(issue => issue.rule === 'eqeqeq')

    expect(loose).toBeDefined()
    expect(onDisk.split('\n')[(loose?.line ?? 0) - 1]).toContain('==')
    expect(response.totalIssues).toBe((response.fixedCount ?? 0) + (response.remainingCount ?? 0))
  }, 120_000)

  it('keeps the edits when only a custom rule matches, and the fixers still ran', async () => {
    const file = write('custom.js', 'var legacy = 1 // HACK\nexport { legacy }\n')
    const rule: CustomRule = { id: 'no-hack', message: 'No HACK comments', pattern: 'HACK', severity: 'error' }

    const response = await new QualityGate(config({ customRules: [rule] })).run([file], { phases: 'phase1' })

    expect(fs.readFileSync(file, 'utf8')).toContain('const legacy = 1')
    expect(response.success).toBe(false)
    expect(response.remaining.map(issue => issue.rule)).toEqual(['custom:no-hack'])
    expect(response.remaining[0]?.line).toBe(1)
  }, 120_000)

  it('does not run Phase 2 while findings remain', async () => {
    const file = write('mixed.js', mixed)
    const phase2 = { isConfigured: () => true, run: vi.fn() }

    const response = await new QualityGate(config(), { phase2 }).run([file])

    expect(response.success).toBe(false)
    expect(phase2.run).not.toHaveBeenCalled()
  }, 120_000)

  it('commits the transaction instead of rolling it back', async () => {
    const transaction = { recordChange: vi.fn(), commit: vi.fn().mockResolvedValue(undefined), rollback: vi.fn() }
    const gate = new QualityGate(config(), {
      transactionManager: { begin: () => transaction } as unknown as TransactionManager,
      phase1: {
        run: vi.fn().mockResolvedValue({
          passed: false,
          keepEdits: true,
          fixed: { eslint: 1, curlyBraces: 0, singleLineArrow: 0, prettier: 0, json: 0 },
          issues: [{ rule: 'eqeqeq', file: 'a.js', line: 3, message: 'm', severity: 'error' }]
        })
      },
      phase2: { isConfigured: () => false, run: vi.fn() }
    })

    const response = await gate.run(['a.js'], { phases: 'phase1' })

    expect(transaction.commit).toHaveBeenCalledTimes(1)
    expect(transaction.rollback).not.toHaveBeenCalled()
    expect(response).toMatchObject({ success: false, fixedCount: 1, remainingCount: 1 })
  })
})

const rejects = async (mockVerifier: () => void): Promise<{ onDisk: string; passed: boolean; keepEdits?: boolean }> => {
  const file = write('mixed.js', mixed)

  mockVerifier()

  const result = await new Phase1Local(config()).run([file], new TransactionManager().begin())

  return {
    onDisk: fs.readFileSync(file, 'utf8'),
    passed: result.passed,
    ...(result.keepEdits ? { keepEdits: true } : {})
  }
}

describe('a failure that means the fixers broke the code still rolls everything back', () => {
  it('on a type error the fixers introduced', async () => {
    const passes = { passed: true, status: 'PASS' as const, errors: [] }
    const fails = { passed: false, status: 'FAIL' as const, errors: [] }

    const outcome = await rejects(() => {
      vi.spyOn(Verifier.prototype, 'runTypeCheck').mockResolvedValueOnce(passes).mockResolvedValueOnce(fails)
    })

    expect(outcome.passed).toBe(false)
    expect(outcome.keepEdits).toBeUndefined()
  }, 120_000)

  it('when ESLint fails to run while it is fixing, even if a later check would pass', async () => {
    const outcome = await rejects(() => {
      vi.spyOn(Verifier.prototype, 'runLintFix').mockResolvedValue({
        passed: false,
        status: 'ERROR',
        scannedFiles: [],
        hasErrors: true,
        fixedCount: 1,
        errors: [{ rule: 'eslint', file: 'a.js', line: 0, message: 'parser crashed', severity: 'error' }]
      })
    })

    expect(outcome.passed).toBe(false)
    expect(outcome.keepEdits).toBeUndefined()
  }, 120_000)

  it('when ESLint cannot run on the result', async () => {
    const outcome = await rejects(() => {
      vi.spyOn(Verifier.prototype, 'runLintCheck').mockResolvedValue({
        passed: false,
        status: 'ERROR',
        scannedFiles: [],
        hasErrors: true,
        fixedCount: 0,
        errors: [{ rule: 'eslint', file: 'a.js', line: 0, message: 'parser crashed', severity: 'error' }]
      })
    })

    expect(outcome.passed).toBe(false)
    expect(outcome.keepEdits).toBeUndefined()
  }, 120_000)
})

describe('counting fixes', () => {
  it('does not count JSON validation passes as fixes', async () => {
    const transaction = { recordChange: vi.fn(), commit: vi.fn().mockResolvedValue(undefined), rollback: vi.fn() }
    const gate = new QualityGate(config(), {
      transactionManager: { begin: () => transaction } as unknown as TransactionManager,
      phase1: {
        run: vi.fn().mockResolvedValue({
          passed: true,
          fixed: { eslint: 0, curlyBraces: 0, singleLineArrow: 0, prettier: 0, json: 3 },
          issues: []
        })
      },
      phase2: { isConfigured: () => false, run: vi.fn() }
    })

    const response = await gate.run(['package.json'], { phases: 'phase1' })

    expect(response.fixed.json).toBe(3)
    expect(response.fixedCount).toBe(0)
    expect(response.totalIssues).toBe(0)
  })
})

const gateWith = (phase1Result: object) => {
  const transaction = {
    recordChange: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined)
  }

  return new QualityGate(config(), {
    transactionManager: { begin: () => transaction } as unknown as TransactionManager,
    phase1: { run: vi.fn().mockResolvedValue(phase1Result) },
    phase2: { isConfigured: () => false, run: vi.fn() }
  })
}

describe('warnings', () => {
  const cleanFix = { eslint: 0, curlyBraces: 0, singleLineArrow: 0, prettier: 0, json: 0 }

  it('passes what Phase 1 could not do on to a successful response', async () => {
    const response = await gateWith({
      passed: true,
      fixed: cleanFix,
      issues: [],
      warnings: ['curlyBraces skipped a.ts: boom']
    }).run(['a.ts'], { phases: 'phase1' })

    expect(response.success).toBe(true)
    expect(response.warnings).toEqual(['curlyBraces skipped a.ts: boom'])
  })

  it('passes them on to a failed response as well', async () => {
    const response = await gateWith({
      passed: false,
      fixed: cleanFix,
      issues: [{ rule: 'typescript', file: 'a.ts', line: 1, message: 'm', severity: 'error' }],
      warnings: ['Custom rule "x" skipped a.ts: it could not be read.']
    }).run(['a.ts'], { phases: 'phase1' })

    expect(response.success).toBe(false)
    expect(response.warnings).toEqual(['Custom rule "x" skipped a.ts: it could not be read.'])
  })

  it('leaves the field out when there is nothing to say', async () => {
    const response = await gateWith({ passed: true, fixed: cleanFix, issues: [] }).run(['a.ts'], { phases: 'phase1' })

    expect(response).not.toHaveProperty('warnings')
  })
})
