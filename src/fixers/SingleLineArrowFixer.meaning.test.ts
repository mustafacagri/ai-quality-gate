import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { TransactionManager } from '@/core/TransactionManager'

import { SingleLineArrowFixer } from './SingleLineArrowFixer'

let tmp: string

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-arrow-meaning-'))
})

afterEach(() => fs.rmSync(tmp, { force: true, recursive: true }))

/** Runs the fixer and returns the program text before and after, and what the program evaluates to. */
const fix = async (body: string): Promise<{ after: string; before: string; fixes: number }> => {
  const file = path.join(tmp, 'program.js')
  const before = `const a = 1\nconst b = 2\nconst result = [10].map(() => {\n  return ${body}\n})\n`

  fs.writeFileSync(file, before, 'utf8')

  const fixes = await new SingleLineArrowFixer().scanAndFix(file, new TransactionManager().begin())

  return { before, after: fs.readFileSync(file, 'utf8'), fixes: fixes.length }
}

const valueOf = (program: string): unknown => vm.runInNewContext(`${program}\nresult`)

describe('SingleLineArrowFixer keeps what the arrow returns', () => {
  it('wraps a comma expression, so the second operand is not turned into another argument', async () => {
    const { before, after, fixes } = await fix('a, b')

    expect(fixes).toBe(1)
    expect(after).toContain('[10].map(() => (a, b))')
    expect(valueOf(after)).toEqual(valueOf(before))
    expect(valueOf(after)).toEqual([2])
  })

  it('wraps an expression that begins with a brace, which would otherwise read as a block', async () => {
    const { before, after, fixes } = await fix('{ answer: 42 }.answer')

    expect(fixes).toBe(1)
    expect(after).toContain('() => ({ answer: 42 }.answer)')
    expect(valueOf(after)).toEqual(valueOf(before))
    expect(valueOf(after)).toEqual([42])
  })

  it('still leaves a plain expression without parentheses', async () => {
    const { after } = await fix('a + b')

    expect(after).toContain('[10].map(() => a + b)')
  })

  it('does not wrap a comma that sits inside a call', async () => {
    const { after } = await fix('Math.max(a, b)')

    expect(after).toContain('[10].map(() => Math.max(a, b))')
  })
})
