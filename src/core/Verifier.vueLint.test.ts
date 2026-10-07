import fs from 'node:fs'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Verifier } from '@/core/Verifier'
import { DEFAULT_FIXER_CONFIG, type Config } from '@/types'

let dir: string
let verifier: Verifier

const config = (): Config => ({
  projectRoot: process.cwd(),
  phase1Timeout: 120_000,
  phase2Timeout: 1,
  enableI18nRules: false,
  fixers: { ...DEFAULT_FIXER_CONFIG }
})

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(process.cwd(), 'aqg-vue-lint-'))
  verifier = new Verifier(config())
})

afterEach(() => fs.rmSync(dir, { force: true, recursive: true }))

const write = (name: string, source: string): string => {
  const file = path.join(dir, name)

  fs.writeFileSync(file, source, 'utf8')

  return file
}

const ruleIds = async (...files: string[]): Promise<string[]> => {
  const result = await verifier.runLintCheck(files)

  // A lint run that crashed reports no rules at all, which would let every "does not contain" assertion pass.
  expect(result.status, JSON.stringify(result.errors)).not.toBe('ERROR')

  return [...new Set(result.errors.map(issue => issue.rule))].sort((left, right) => left.localeCompare(right))
}

const timer = 'export const wait = (run) => setTimeout(run, 5000)\n'

describe('Verifier lints Vue scripts with the rule set of their language', { timeout: 120_000 }, () => {
  it('holds a plain-JS script to the JavaScript rules, not the TypeScript-only ones', async () => {
    const plain = write('Plain.vue', `<script>\n${timer}</script>\n`)

    expect(await ruleIds(plain)).not.toContain('@typescript-eslint/no-magic-numbers')
  })

  it('still holds a lang="ts" script to the TypeScript rules', async () => {
    const typed = write('Typed.vue', `<script setup lang="ts">\n${timer}</script>\n`)

    expect(await ruleIds(typed)).toContain('@typescript-eslint/no-magic-numbers')
  })

  it('gives a plain-JS script the same findings as the same code in a .js file', async () => {
    const code = `${timer}export const items = [1, 2, 3].map(item => item)\nexport var legacy = 1\n`
    const plain = write('Parity.vue', `<script>\n${code}</script>\n`)
    const script = write('parity.js', code)

    expect(await ruleIds(plain)).toEqual(await ruleIds(script))
  })

  it('lints a plain-JS Vue file and a TypeScript one in the same call', async () => {
    const plain = write('Plain.vue', `<script>\n${timer}</script>\n`)
    const typed = write('Typed.vue', `<script setup lang="ts">\n${timer}</script>\n`)
    const result = await verifier.runLintCheck([plain, typed])

    expect(result.scannedFiles).toEqual(expect.arrayContaining([plain, typed]))
    expect(result.errors.filter(issue => issue.file === typed).map(issue => issue.rule)).toContain(
      '@typescript-eslint/no-magic-numbers'
    )
    expect(result.errors.filter(issue => issue.file === plain).map(issue => issue.rule)).not.toContain(
      '@typescript-eslint/no-magic-numbers'
    )
  })

  it('counts the rewrites of every group when it fixes', async () => {
    const plain = write('Plain.vue', '<script>\nvar a = 1\nexport { a }\n</script>\n')
    const typed = write('Typed.vue', '<script setup lang="ts">\nvar b = 1\nexport type B = typeof b\n</script>\n')
    const result = await verifier.runLintFix([plain, typed])

    expect(result.fixedCount).toBe(2)
    expect(fs.readFileSync(plain, 'utf8')).toContain('const a = 1')
    expect(fs.readFileSync(typed, 'utf8')).toContain('const b = 1')
  })
})
