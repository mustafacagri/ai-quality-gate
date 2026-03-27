import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it, beforeEach, afterEach } from 'vitest'

import { TransactionManager } from '@/core/TransactionManager'
import { DEFAULT_FIXER_CONFIG } from '@/types'

import { AutoFixer } from './AutoFixer'

const makeTempDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-autofix-'))

describe('AutoFixer', () => {
  let tmp: string

  beforeEach(() => {
    tmp = makeTempDir()
  })

  afterEach(() => {
    fs.rmSync(tmp, { force: true, recursive: true })
  })

  it('runs curly-braces then single-line arrow fixers in order on the same file', async () => {
    const file = path.join(tmp, 'mixed.ts')
    const before = `export function f(x: boolean): number {
  if (x) {
    return 1
  }
  const g = () => {
    return 2
  }
  return g()
}
`
    fs.writeFileSync(file, before, 'utf8')

    const fixer = new AutoFixer(DEFAULT_FIXER_CONFIG)
    const names = fixer.getFixerNames()

    expect(names[0]).toBe('curlyBraces')
    expect(names[1]).toBe('singleLineArrow')

    const tx = new TransactionManager().begin()
    const summary = await fixer.scanAndFix([file], tx)

    expect(summary.curlyBraces + summary.singleLineArrow).toBeGreaterThan(0)

    const after = fs.readFileSync(file, 'utf8')
    expect(after).not.toBe(before)
  })

  it('restores the file when the transaction is rolled back after fixes', async () => {
    const file = path.join(tmp, 'rollback.ts')
    const original = `export const r = (): number => {
  return 99
}
`
    fs.writeFileSync(file, original, 'utf8')

    const fixer = new AutoFixer({ ...DEFAULT_FIXER_CONFIG, curlyBraces: false, singleLineArrow: true })
    const tx = new TransactionManager().begin()

    await fixer.scanAndFix([file], tx)

    expect(fs.readFileSync(file, 'utf8')).not.toBe(original)

    await tx.rollback()

    expect(fs.readFileSync(file, 'utf8')).toBe(original)
  })
})
