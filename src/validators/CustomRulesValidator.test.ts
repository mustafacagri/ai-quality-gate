import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import type { CustomRule } from '@/types'
import { CustomRulesValidator } from '@/validators/CustomRulesValidator'

const makeTempDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-custom-'))

describe('CustomRulesValidator', () => {
  it('returns empty when rules or files list is empty', async () => {
    const validator = new CustomRulesValidator()

    expect(await validator.validate([], ['/tmp/x.ts'])).toEqual([])
    expect(await validator.validate([{ id: 'x', message: 'm', pattern: 'a', severity: 'error' }], [])).toEqual([])
  })

  it('matches regex and reports line, column, rule, severity', async () => {
    const dir = makeTempDir()
    const file = path.join(dir, 'app.ts')

    fs.writeFileSync(file, 'const x = 1\nconsole.log(x)\n', 'utf8')

    const rules: CustomRule[] = [
      {
        id: 'no-console',
        message: 'Console.log not allowed',
        pattern: String.raw`console\.log\(`,
        severity: 'error'
      }
    ]

    const issues = await new CustomRulesValidator().validate(rules, [file])

    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      rule: 'custom:no-console',
      line: 2,
      column: 1,
      message: 'Console.log not allowed',
      severity: 'error'
    })
    expect(issues[0]?.file).toBe(path.normalize(file))
  })

  it('runs multiple rules on the same file', async () => {
    const dir = makeTempDir()
    const file = path.join(dir, 'a.ts')

    fs.writeFileSync(file, 'debugger\nconsole.log(1)\n', 'utf8')

    const rules: CustomRule[] = [
      { id: 'no-debugger', message: 'No debugger', pattern: 'debugger', severity: 'warning' },
      { id: 'no-console', message: 'No console', pattern: String.raw`console\.log\(`, severity: 'error' }
    ]

    const issues = await new CustomRulesValidator().validate(rules, [file])

    expect(issues).toHaveLength(2)
    const ruleIds = issues.map(i => i.rule).sort((a, b) => a.localeCompare(b))

    expect(ruleIds).toEqual(['custom:no-console', 'custom:no-debugger'])
  })

  it('scans multiple files', async () => {
    const dir = makeTempDir()
    const file1 = path.join(dir, 'one.ts')
    const file2 = path.join(dir, 'two.ts')

    fs.writeFileSync(file1, 'ok\n', 'utf8')
    fs.writeFileSync(file2, 'console.log()\n', 'utf8')

    const rules: CustomRule[] = [
      { id: 'no-console', message: 'No console', pattern: String.raw`console\.log\(`, severity: 'error' }
    ]

    const issues = await new CustomRulesValidator().validate(rules, [file1, file2])

    expect(issues).toHaveLength(1)
    expect(issues[0]?.file).toBe(path.normalize(file2))
  })

  it('reports multiple matches on one line', async () => {
    const dir = makeTempDir()
    const file = path.join(dir, 'm.ts')

    fs.writeFileSync(file, 'console.log(1); console.log(2)\n', 'utf8')

    const rules: CustomRule[] = [
      { id: 'no-console', message: 'No console', pattern: String.raw`console\.log\(`, severity: 'error' }
    ]

    const issues = await new CustomRulesValidator().validate(rules, [file])

    expect(issues).toHaveLength(2)
    expect(issues[0]?.column).toBe(1)
    expect(issues[1]?.column).toBeGreaterThan(1)
  })

  it('skips invalid regex pattern and logs', async () => {
    const dir = makeTempDir()
    const file = path.join(dir, 'x.ts')

    fs.writeFileSync(file, 'const a = 1\n', 'utf8')

    const err = vi.spyOn(console, 'error').mockImplementation(() => {})

    const rules: CustomRule[] = [
      { id: 'bad', message: 'bad', pattern: '(', severity: 'error' },
      { id: 'good', message: 'good', pattern: 'const', severity: 'info' }
    ]

    const issues = await new CustomRulesValidator().validate(rules, [file])

    expect(issues).toHaveLength(1)
    expect(issues[0]?.rule).toBe('custom:good')
    expect(err).toHaveBeenCalled()

    err.mockRestore()
  })
})
