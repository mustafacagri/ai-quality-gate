import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { SyntaxKind, type SourceFile } from 'ts-morph'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

import { TransactionManager } from '@/core/TransactionManager'

import { SingleLineArrowFixer } from './SingleLineArrowFixer'

const makeTempDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-arrow-'))

describe('SingleLineArrowFixer', () => {
  let tmp: string

  beforeEach(() => (tmp = makeTempDir()))

  afterEach(() => fs.rmSync(tmp, { force: true, recursive: true }))

  it('converts multi-line arrow with return to a single-line arrow', async () => {
    const file = path.join(tmp, 'a.ts')
    const before = `export const f = (): number => {
  return 42
}
`
    fs.writeFileSync(file, before, 'utf8')

    const fixer = new SingleLineArrowFixer()
    const tx = new TransactionManager().begin()
    const fixes = await fixer.scanAndFix(file, tx)

    const after = fs.readFileSync(file, 'utf8')

    expect(fixes.length).toBeGreaterThanOrEqual(1)
    expect(after.replaceAll(/\s+/g, ' ')).toContain('=> 42')
  })

  it('does not change an arrow that is already a single expression', async () => {
    const file = path.join(tmp, 'b.ts')
    const before = `export const g = (): number => 7
`
    fs.writeFileSync(file, before, 'utf8')

    const fixer = new SingleLineArrowFixer()
    const tx = new TransactionManager().begin()
    const fixes = await fixer.scanAndFix(file, tx)

    expect(fs.readFileSync(file, 'utf8')).toBe(before)
    expect(fixes).toHaveLength(0)
  })

  it('wraps object literal returns in parentheses', async () => {
    const file = path.join(tmp, 'obj.ts')
    const before = `export const f = () => {
  return { a: 1 }
}
`
    fs.writeFileSync(file, before, 'utf8')

    const fixer = new SingleLineArrowFixer()
    const tx = new TransactionManager().begin()
    const fixes = await fixer.scanAndFix(file, tx)

    const after = fs.readFileSync(file, 'utf8')

    expect(fixes.length).toBeGreaterThanOrEqual(1)
    expect(after.replaceAll(/\s+/g, ' ')).toMatch(/=> \(\{ a: 1 \}\)/)
  })

  it('wraps assignment expressions in parentheses', async () => {
    const file = path.join(tmp, 'assign.ts')
    const before = `const o = { n: 0 }
export const f = () => {
  o.n = 1
}
`
    fs.writeFileSync(file, before, 'utf8')

    const fixer = new SingleLineArrowFixer()
    const tx = new TransactionManager().begin()
    const fixes = await fixer.scanAndFix(file, tx)

    const after = fs.readFileSync(file, 'utf8')

    expect(fixes.length).toBeGreaterThanOrEqual(1)
    expect(after).toContain('=> (o.n = 1)')
  })

  it('converts async arrow with block body', async () => {
    const file = path.join(tmp, 'async.ts')
    const before = `export const f = async () => {
  return 99
}
`
    fs.writeFileSync(file, before, 'utf8')

    const fixer = new SingleLineArrowFixer()
    const tx = new TransactionManager().begin()
    const fixes = await fixer.scanAndFix(file, tx)

    const after = fs.readFileSync(file, 'utf8')

    expect(fixes.length).toBeGreaterThanOrEqual(1)
    expect(after.replaceAll(/\s+/g, ' ')).toContain('async () => 99')
  })

  it('converts bare return to undefined expression', async () => {
    const file = path.join(tmp, 'voidret.ts')
    const before = `export const f = (): void => {
  return
}
`
    fs.writeFileSync(file, before, 'utf8')

    const fixer = new SingleLineArrowFixer()
    const tx = new TransactionManager().begin()
    const fixes = await fixer.scanAndFix(file, tx)

    const after = fs.readFileSync(file, 'utf8')

    expect(fixes.length).toBeGreaterThanOrEqual(1)
    expect(after).toContain('=> undefined')
  })

  it('skips .vue files', async () => {
    const file = path.join(tmp, 'x.vue')
    fs.writeFileSync(file, 'export default () => { return 1 }', 'utf8')

    const fixer = new SingleLineArrowFixer()
    const tx = new TransactionManager().begin()
    const fixes = await fixer.scanAndFix(file, tx)

    expect(fixes).toHaveLength(0)
  })

  it('does not change when the result would exceed max line length', async () => {
    const file = path.join(tmp, 'long.ts')
    const longLit = 'x'.repeat(200)
    const before = `export const f = () => {
  return "${longLit}"
}
`
    fs.writeFileSync(file, before, 'utf8')

    const fixer = new SingleLineArrowFixer()
    const tx = new TransactionManager().begin()
    const fixes = await fixer.scanAndFix(file, tx)

    expect(fs.readFileSync(file, 'utf8')).toBe(before)
    expect(fixes).toHaveLength(0)
  })

  it('logs and returns no fixes when the source file cannot be loaded', async () => {
    const fixer = new SingleLineArrowFixer()
    const tx = new TransactionManager().begin()
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})

    const fixes = await fixer.scanAndFix(path.join(tmp, 'definitely-missing-file.ts'), tx)

    expect(fixes).toHaveLength(0)
    expect(err).toHaveBeenCalled()

    err.mockRestore()
  })

  it('converts expression-statement body that is not an assignment', async () => {
    const file = path.join(tmp, 'binary.ts')
    const before = `export const f = () => {
  1 + 2
}
`
    fs.writeFileSync(file, before, 'utf8')

    const fixer = new SingleLineArrowFixer()
    const tx = new TransactionManager().begin()
    const fixes = await fixer.scanAndFix(file, tx)
    const after = fs.readFileSync(file, 'utf8')

    expect(fixes.length).toBeGreaterThanOrEqual(1)
    expect(after.replaceAll(/\s+/g, ' ')).toContain('=> 1 + 2')
  })

  it('uses no parens around a single identifier parameter', async () => {
    const file = path.join(tmp, 'bare-id.ts')
    const before = `export const f = x => {
  return x + 1
}
`
    fs.writeFileSync(file, before, 'utf8')

    const fixer = new SingleLineArrowFixer()
    const tx = new TransactionManager().begin()
    await fixer.scanAndFix(file, tx)
    const after = fs.readFileSync(file, 'utf8')

    expect(after.replaceAll(/\s+/g, ' ')).toMatch(/x => x \+ 1/)
  })

  it('wraps compound assignment expressions', async () => {
    const file = path.join(tmp, 'pluseq.ts')
    const before = `const o = { n: 0 }
export const f = () => {
  o.n += 1
}
`
    fs.writeFileSync(file, before, 'utf8')

    const fixer = new SingleLineArrowFixer()
    const tx = new TransactionManager().begin()
    await fixer.scanAndFix(file, tx)
    const after = fs.readFileSync(file, 'utf8')

    expect(after).toContain('=> (o.n += 1)')
  })

  it('still fixes arrows nested in calls without variable-statement indentation', async () => {
    const file = path.join(tmp, 'nested.ts')
    const before = `setTimeout(() => {
  return 1
}, 0)
`
    fs.writeFileSync(file, before, 'utf8')

    const fixer = new SingleLineArrowFixer()
    const tx = new TransactionManager().begin()
    const fixes = await fixer.scanAndFix(file, tx)
    const after = fs.readFileSync(file, 'utf8')

    expect(fixes.length).toBeGreaterThanOrEqual(1)
    expect(after.replaceAll(/\s+/g, ' ')).toContain('() => 1')
  })

  it('reports transform failure when replacement text is invalid', () => {
    const file = path.join(tmp, 'transform.ts')
    fs.writeFileSync(file, 'const x = () => { return 1; }\n', 'utf8')

    const fixer = new SingleLineArrowFixer()
    const sourceFile = (fixer as unknown as { getSourceFile: (p: string) => SourceFile }).getSourceFile(file)
    const arrow = sourceFile.getDescendantsOfKind(SyntaxKind.ArrowFunction)[0]

    if (arrow === undefined) throw new Error('expected arrow function')

    type TransformFn = (a: typeof arrow, b: string) => { success: boolean; error?: string }
    const transform = (fixer as unknown as { transformArrowFunction: TransformFn }).transformArrowFunction
    const result = transform(arrow, ')')

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })
})
