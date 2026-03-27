import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it, beforeEach, afterEach } from 'vitest'

import { TransactionManager } from '@/core/TransactionManager'

import { CurlyBracesFixer } from './CurlyBracesFixer'

const makeTempDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-curly-'))

describe('CurlyBracesFixer', () => {
  let tmp: string

  beforeEach(() => {
    tmp = makeTempDir()
  })

  afterEach(() => {
    fs.rmSync(tmp, { force: true, recursive: true })
  })

  it('removes braces from a single-statement if', async () => {
    const file = path.join(tmp, 'a.ts')
    const before = `export function f(x: boolean): number {
  if (x) {
    return 1
  }
  return 0
}
`
    fs.writeFileSync(file, before, 'utf8')

    const fixer = new CurlyBracesFixer()
    const tx = new TransactionManager().begin()
    const fixes = await fixer.scanAndFix(file, tx)

    const after = fs.readFileSync(file, 'utf8')

    expect(fixes.length).toBeGreaterThanOrEqual(1)
    expect(after).toContain('if (x) return 1')
    expect(after).not.toContain('if (x) {\n    return 1')
  })

  it('does not change multi-statement if bodies', async () => {
    const file = path.join(tmp, 'b.ts')
    const before = `export function g(x: boolean): void {
  if (x) {
    void 0
    void 0
  }
}
`
    fs.writeFileSync(file, before, 'utf8')

    const fixer = new CurlyBracesFixer()
    const tx = new TransactionManager().begin()
    const fixes = await fixer.scanAndFix(file, tx)

    expect(fs.readFileSync(file, 'utf8')).toBe(before)
    expect(fixes).toHaveLength(0)
  })

  it('does not change if-else', async () => {
    const file = path.join(tmp, 'c.ts')
    const before = `export function h(x: boolean): number {
  if (x) {
    return 1
  } else {
    return 2
  }
}
`
    fs.writeFileSync(file, before, 'utf8')

    const fixer = new CurlyBracesFixer()
    const tx = new TransactionManager().begin()
    const fixes = await fixer.scanAndFix(file, tx)

    expect(fs.readFileSync(file, 'utf8')).toBe(before)
    expect(fixes).toHaveLength(0)
  })

  it('does not change when combined line would exceed max length', async () => {
    const file = path.join(tmp, 'long.ts')
    const longCond = 'x'.repeat(200)
    const before = `export function long(${longCond}: boolean): number {
  if (${longCond}) {
    return 1
  }
  return 0
}
`
    fs.writeFileSync(file, before, 'utf8')

    const fixer = new CurlyBracesFixer()
    const tx = new TransactionManager().begin()
    const fixes = await fixer.scanAndFix(file, tx)

    expect(fs.readFileSync(file, 'utf8')).toBe(before)
    expect(fixes).toHaveLength(0)
  })
})
