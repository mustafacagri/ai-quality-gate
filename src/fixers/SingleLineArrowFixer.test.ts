import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'

import { SyntaxKind, type SourceFile } from 'ts-morph'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

import { TransactionManager } from '@/core/TransactionManager'

import { SingleLineArrowFixer } from './SingleLineArrowFixer'

const makeTempDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-arrow-'))

let tmp: string

beforeEach(() => (tmp = makeTempDir()))

afterEach(() => fs.rmSync(tmp, { force: true, recursive: true }))

describe('SingleLineArrowFixer returns', () => {
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
    expect(after.replaceAll(/\s+/g, ' ')).toContain('(): number => 42')
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
})

describe('SingleLineArrowFixer parentheses', () => {
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

  it('does not convert an assignment expression statement', async () => {
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

    expect(fixes).toHaveLength(0)
    expect(fs.readFileSync(file, 'utf8')).toBe(before)
  })

  it('wraps a returned assignment in parentheses and keeps the return type', async () => {
    const file = path.join(tmp, 'return-assign.ts')
    const before = `const o = { n: 0 }
export const f = (): number => {
  return o.n = 1
}
`
    fs.writeFileSync(file, before, 'utf8')

    const fixer = new SingleLineArrowFixer()
    const tx = new TransactionManager().begin()
    await fixer.scanAndFix(file, tx)

    expect(fs.readFileSync(file, 'utf8').replaceAll(/\s+/g, ' ')).toContain('(): number => (o.n = 1)')
  })
})

describe('SingleLineArrowFixer async and empty return', () => {
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

  it('does not rewrite a bare return, which would read a shadowed undefined binding', async () => {
    const file = path.join(tmp, 'voidret.js')
    const before = `function run(undefined = 7) {
  const f = () => {
    return
  }
  return f()
}
`
    fs.writeFileSync(file, before, 'utf8')

    const fixer = new SingleLineArrowFixer()
    const tx = new TransactionManager().begin()
    const fixes = await fixer.scanAndFix(file, tx)

    expect(fixes).toHaveLength(0)
    expect(fs.readFileSync(file, 'utf8')).toBe(before)
    expect(vm.runInNewContext(`${before}\nrun()`)).toBeUndefined()
  })
})

describe('SingleLineArrowFixer Vue script block', () => {
  it('rewrites only the Vue script block and keeps template and style bytes', async () => {
    const file = path.join(tmp, 'Widget.vue')
    const before = `<template>
  <section>keep</section>
</template>
<script setup lang="ts" generic="T extends string">
const run = (): number => {
  return 1
}
</script>
<style scoped>
section { color: red; }
</style>
`
    fs.writeFileSync(file, before, 'utf8')

    const fixer = new SingleLineArrowFixer()
    const tx = new TransactionManager().begin()
    const fixes = await fixer.scanAndFix(file, tx)
    const after = fs.readFileSync(file, 'utf8')

    const runLine = before.split('\n').findIndex(line => line.startsWith('const run')) + 1

    expect(fixes).toHaveLength(1)
    expect(fixes[0]?.line).toBe(runLine)
    expect(after).toContain('const run = (): number => 1')
    expect(after).toContain('generic="T extends string"')
    expect(after).toContain('  <section>keep</section>')
    expect(after).toContain('section { color: red; }')
    expect(after).not.toContain('return 1')
    expect(fs.readdirSync(tmp)).toEqual(['Widget.vue'])
  })
})

describe('SingleLineArrowFixer both Vue script blocks', () => {
  it('rewrites both script and script setup without touching the template between them', async () => {
    const file = path.join(tmp, 'Both.vue')
    const before = `<script lang="ts">
export const legacy = (): number => {
  return 2
}
</script>
<template>
  <p>middle</p>
</template>
<script setup lang="ts">
const run = (): number => {
  return 1
}
</script>
`
    fs.writeFileSync(file, before, 'utf8')

    const fixer = new SingleLineArrowFixer()
    const tx = new TransactionManager().begin()
    const fixes = await fixer.scanAndFix(file, tx)
    const after = fs.readFileSync(file, 'utf8')

    expect(fixes).toHaveLength(2)
    expect(after).toContain('export const legacy = (): number => 2')
    expect(after).toContain('const run = (): number => 1')
    expect(after).toContain('  <p>middle</p>')
    expect(fs.readdirSync(tmp)).toEqual(['Both.vue'])
  })
})

describe('SingleLineArrowFixer non-JS Vue script', () => {
  it('does not rewrite a Vue file that has no JavaScript script block', async () => {
    const file = path.join(tmp, 'Plain.vue')
    const before = `<template>
  <p>only</p>
</template>
<script lang="coffee">
foo
</script>
`
    fs.writeFileSync(file, before, 'utf8')

    const fixer = new SingleLineArrowFixer()
    const tx = new TransactionManager().begin()
    const fixes = await fixer.scanAndFix(file, tx)

    expect(fixes).toHaveLength(0)
    expect(fs.readFileSync(file, 'utf8')).toBe(before)
  })
})

describe('SingleLineArrowFixer line length and load errors', () => {
  it('does not change when the result would exceed max line length', async () => {
    const file = path.join(tmp, 'long.ts')
    const longLit = 'x'.repeat(100 + 100)
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
})

describe('SingleLineArrowFixer expression bodies', () => {
  it('does not convert an expression statement into a returned value', async () => {
    const file = path.join(tmp, 'binary.ts')
    const before = `const items: number[] = []
export const f = (): undefined => {
  items.push(1)
}
`
    fs.writeFileSync(file, before, 'utf8')

    const fixer = new SingleLineArrowFixer()
    const tx = new TransactionManager().begin()
    const fixes = await fixer.scanAndFix(file, tx)

    expect(fixes).toHaveLength(0)
    expect(fs.readFileSync(file, 'utf8')).toBe(before)
  })

  it('keeps an arrow type parameter and its return type', async () => {
    const file = path.join(tmp, 'generic.ts')
    const before = `export const identity = <T>(value: T): T => {
  return value
}
`
    fs.writeFileSync(file, before, 'utf8')

    const fixer = new SingleLineArrowFixer()
    const tx = new TransactionManager().begin()
    await fixer.scanAndFix(file, tx)

    expect(fs.readFileSync(file, 'utf8').replaceAll(/\s+/g, ' ')).toContain('<T>(value: T): T => value')
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
})

describe('SingleLineArrowFixer assignments and nesting', () => {
  it('does not convert a compound assignment expression statement', async () => {
    const file = path.join(tmp, 'pluseq.ts')
    const before = `const o = { n: 0 }
export const f = () => {
  o.n += 1
}
`
    fs.writeFileSync(file, before, 'utf8')

    const fixer = new SingleLineArrowFixer()
    const tx = new TransactionManager().begin()
    const fixes = await fixer.scanAndFix(file, tx)

    expect(fixes).toHaveLength(0)
    expect(fs.readFileSync(file, 'utf8')).toBe(before)
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
})

describe('SingleLineArrowFixer invalid replacement', () => {
  it('reports transform failure when replacement text is invalid', () => {
    const file = path.join(tmp, 'transform.ts')
    fs.writeFileSync(file, 'const x = () => { return 1; }\n', 'utf8')

    const fixer = new SingleLineArrowFixer()
    const sourceFile = (fixer as unknown as { getSourceFile: (p: string) => SourceFile }).getSourceFile(file)
    const arrow = sourceFile.getDescendantsOfKind(SyntaxKind.ArrowFunction)[0]

    if (arrow === undefined) throw new Error('expected arrow function')

    type TransformFn = (a: typeof arrow, b: string) => { success: boolean; error?: string }
    const transform = (fixer as unknown as { transformArrowFunction: TransformFn }).transformArrowFunction
    const result = transform.call(fixer, arrow, ')')

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })
})
