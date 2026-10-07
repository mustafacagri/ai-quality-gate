import fs from 'node:fs'
import vm from 'node:vm'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it, beforeEach, afterEach } from 'vitest'

import { TransactionManager } from '@/core/TransactionManager'

import { CurlyBracesFixer } from './CurlyBracesFixer'

const makeTempDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-curly-'))

let tmp: string

beforeEach(() => (tmp = makeTempDir()))

afterEach(() => fs.rmSync(tmp, { force: true, recursive: true }))

describe('CurlyBracesFixer single-statement if', () => {
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
})

describe('CurlyBracesFixer guards', () => {
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
    const longCond = 'x'.repeat(100 + 100)
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

describe('CurlyBracesFixer Vue script', () => {
  it('removes braces inside a Vue script block and reports the file line', async () => {
    const file = path.join(tmp, 'Widget.vue')
    const before = `<template>
  <p>keep</p>
</template>
<script setup lang="ts">
function f(ready: boolean): number {
  if (ready) {
    return 1
  }
  return 0
}
</script>
`
    fs.writeFileSync(file, before, 'utf8')

    const fixer = new CurlyBracesFixer()
    const tx = new TransactionManager().begin()
    const fixes = await fixer.scanAndFix(file, tx)
    const after = fs.readFileSync(file, 'utf8')

    const ifLine = before.split('\n').findIndex(line => line.includes('if (ready)')) + 1

    expect(fixes).toHaveLength(1)
    expect(fixes[0]?.line).toBe(ifLine)
    expect(after).toContain('if (ready) return 1;')
    expect(after).toContain('  <p>keep</p>')
    expect(fs.readdirSync(tmp)).toEqual(['Widget.vue'])
  })
})

describe('CurlyBracesFixer statement boundary', () => {
  it('keeps a following bracket statement from joining the if', async () => {
    const file = path.join(tmp, 'asi.js')
    const before = `const events = []
const flag = false
if (flag) {
  events.push(1)
}
[2].forEach(value => {
  events.push(value)
})
`
    fs.writeFileSync(file, before, 'utf8')

    const fixer = new CurlyBracesFixer()
    const tx = new TransactionManager().begin()
    await fixer.scanAndFix(file, tx)
    const after = fs.readFileSync(file, 'utf8')
    const events = vm.runInNewContext(`${after}\nevents`) as number[]

    expect(after).toContain('if (flag) events.push(1);')
    expect(events).toEqual([2])
  })
})

const runOnIfBlock = async (name: string, body: string): Promise<{ before: string; after: string; fixes: number }> => {
  const file = path.join(tmp, name)
  const before = `export function f(x: boolean): void {\n  if (x) {\n    ${body}\n  }\n}\n`

  fs.writeFileSync(file, before, 'utf8')

  const fixes = await new CurlyBracesFixer().scanAndFix(file, new TransactionManager().begin())

  return { before, after: fs.readFileSync(file, 'utf8'), fixes: fixes.length }
}

describe('CurlyBracesFixer statements that need their block', () => {
  it.each([
    ['const declaration', 'const y = 1'],
    ['let declaration', 'let y = 1'],
    ['class declaration', 'class Y {}'],
    ['function declaration', 'function y(): void {}'],
    ['enum declaration', 'enum Y { A }'],
    ['interface declaration', 'interface Y { a: 1 }'],
    ['type alias declaration', 'type Y = 1'],
    ['namespace declaration', 'namespace Y {}'],
    ['empty statement', ';']
  ])('keeps the braces around a %s', async (_kind, body) => {
    const { before, after, fixes } = await runOnIfBlock('declaration.ts', body)

    expect(fixes).toBe(0)
    expect(after).toBe(before)
  })

  it('keeps the braces around a labeled statement, which can hide a declaration', async () => {
    const file = path.join(tmp, 'labeled.cjs')
    const before = 'function f(x) {\n  if (x) {\n    label: function y() {}\n  }\n}\nmodule.exports = { f }\n'

    fs.writeFileSync(file, before, 'utf8')

    const fixes = await new CurlyBracesFixer().scanAndFix(file, new TransactionManager().begin())

    expect(() => new vm.Script(before)).not.toThrow()
    expect(fixes).toHaveLength(0)
    expect(fs.readFileSync(file, 'utf8')).toBe(before)
  })

  it('still removes the braces around a var declaration, which is legal without a block', async () => {
    const { after, fixes } = await runOnIfBlock('var.ts', 'var y = 1')

    expect(fixes).toBe(1)
    expect(after).toContain('if (x) var y = 1;')
  })

  it('keeps the braces around a declaration inside a Vue script block', async () => {
    const file = path.join(tmp, 'Lexical.vue')
    const before = '<script setup>\nif (true) {\n  const value = 1\n}\n</script>\n<template><p>ok</p></template>\n'

    fs.writeFileSync(file, before, 'utf8')

    const fixes = await new CurlyBracesFixer().scanAndFix(file, new TransactionManager().begin())

    expect(fixes).toHaveLength(0)
    expect(fs.readFileSync(file, 'utf8')).toBe(before)
  })
})

const runWithBody = async (body: string): Promise<string> => {
  const file = path.join(tmp, 'terminator.js')

  fs.writeFileSync(file, `export function f(a, xs, g) {\n  if (a) {\n    ${body}\n  }\n}\n`, 'utf8')
  await new CurlyBracesFixer().scanAndFix(file, new TransactionManager().begin())

  return fs.readFileSync(file, 'utf8').split('\n')[1] ?? ''
}

describe('CurlyBracesFixer terminators', () => {
  it.each([
    ['a for loop', 'for (const x of xs) { g(x) }', '  if (a) for (const x of xs) { g(x) }'],
    ['a while loop', 'while (g()) { g() }', '  if (a) while (g()) { g() }'],
    ['a try block', 'try { g() } catch { g() }', '  if (a) try { g() } catch { g() }'],
    [
      'loops nested down to a block',
      'for (const x of xs) while (g()) { g(x) }',
      '  if (a) for (const x of xs) while (g()) { g(x) }'
    ]
  ])('does not add a semicolon after %s, which would be a stray empty statement', async (_name, body, expected) => {
    expect(await runWithBody(body)).toBe(expected)
  })

  it.each([
    ['a for loop with an unbraced body', 'for (const x of xs) g(x)', '  if (a) for (const x of xs) g(x);'],
    ['a while loop whose body is an if', 'while (g()) if (a) g()', '  if (a) while (g()) if (a) g();'],
    ['a call', 'g(1)', '  if (a) g(1);'],
    ['a do-while loop', 'do { g() } while (a)', '  if (a) do { g() } while (a);'],
    ['an object assignment', 'g = { x: 1 }', '  if (a) g = { x: 1 };']
  ])('still ends %s with one semicolon, so a following bracket cannot continue it', async (_name, body, expected) => {
    expect(await runWithBody(body)).toBe(expected)
  })
})

describe('CurlyBracesFixer keeps what the next line means', () => {
  it('does not let a following bracket statement continue an unbraced loop body', async () => {
    const file = path.join(tmp, 'join.js')
    const before =
      'const out = []\nconst xs = [1, 2]\nconst flag = true\nif (flag) {\n  for (const x of xs) out.push(x)\n}\n[9].forEach(v => out.push(v))\n'

    fs.writeFileSync(file, before, 'utf8')
    await new CurlyBracesFixer().scanAndFix(file, new TransactionManager().begin())

    const after = fs.readFileSync(file, 'utf8')

    expect(vm.runInNewContext(`${after}\nout`)).toEqual(vm.runInNewContext(`${before}\nout`))
    expect(after).toContain('if (flag) for (const x of xs) out.push(x);')
  })
})
