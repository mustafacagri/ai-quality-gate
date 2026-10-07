import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { RULE_NAMES } from '@/constants/rules'
import { Verifier } from '@/core/Verifier'
import { DEFAULT_FIXER_CONFIG, type Config } from '@/types'

const baseConfig = (): Config => ({
  projectRoot: '/tmp/aqg-verifier-test',
  phase1Timeout: 30_000,
  phase2Timeout: 300_000,
  enableI18nRules: false,
  fixers: { ...DEFAULT_FIXER_CONFIG }
})

describe('Verifier', () => {
  it('returns passed when there are no TypeScript files', async () => {
    const verifier = new Verifier(baseConfig())

    const empty = await verifier.runTypeCheck([])
    expect(empty.passed).toBe(true)
    expect(empty.errors).toHaveLength(0)

    const jsOnly = await verifier.runTypeCheck(['lib/a.js'])
    expect(jsOnly.passed).toBe(true)
    expect(jsOnly.errors).toHaveLength(0)
  })

  it('returns passed for lint when there are no lintable files', async () => {
    const verifier = new Verifier(baseConfig())

    const result = await verifier.runLintCheck(['scripts/deploy.sh'])

    expect(result.passed).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('returns success with zero formatted files when nothing is formattable', async () => {
    const verifier = new Verifier(baseConfig())

    const empty = await verifier.runPrettier([])
    expect(empty.success).toBe(true)
    expect(empty.formattedCount).toBe(0)

    const noExt = await verifier.runPrettier(['README'])
    expect(noExt.formattedCount).toBe(0)
    expect(noExt.issues).toEqual([])
  })

  it('does not count a file Prettier leaves unchanged', async () => {
    const dir = fs.mkdtempSync(path.join(process.cwd(), '.aqg-prettier-'))
    const formatted = path.join(dir, 'ready.ts')
    fs.writeFileSync(formatted, 'export const ready = true\n', 'utf8')
    const verifier = new Verifier({ ...baseConfig(), projectRoot: process.cwd() })

    try {
      const unchanged = await verifier.runPrettier([formatted])

      expect(unchanged.success).toBe(true)
      expect(unchanged.formattedCount).toBe(0)
    } finally {
      fs.rmSync(dir, { force: true, recursive: true })
    }
  })

  it('counts a changed file once and ignores a duplicate path', async () => {
    const dir = fs.mkdtempSync(path.join(process.cwd(), '.aqg-prettier-'))
    const messy = path.join(dir, 'messy.ts')
    fs.writeFileSync(messy, 'export const ready=true\n', 'utf8')
    const verifier = new Verifier({ ...baseConfig(), projectRoot: process.cwd() })

    try {
      const duplicated = await verifier.runPrettier([messy, messy])

      expect(duplicated.success).toBe(true)
      expect(duplicated.formattedCount).toBe(1)
    } finally {
      fs.rmSync(dir, { force: true, recursive: true })
    }
  })

  it('counts a file Prettier rewrote even though another file made it exit non-zero', async () => {
    const dir = fs.mkdtempSync(path.join(process.cwd(), '.aqg-prettier-'))
    const messy = path.join(dir, 'a-messy.ts')
    const broken = path.join(dir, 'b-broken.ts')
    fs.writeFileSync(messy, 'export const ready=true\n', 'utf8')
    fs.writeFileSync(broken, 'const value =\n', 'utf8')
    const verifier = new Verifier({ ...baseConfig(), projectRoot: process.cwd() })

    try {
      const partial = await verifier.runPrettier([messy, broken])

      expect(partial.success).toBe(false)
      expect(fs.readFileSync(messy, 'utf8')).toBe('export const ready = true\n')
      expect(partial.formattedCount).toBe(1)
      expect(partial.issues[0]?.file).toBe(broken)
    } finally {
      fs.rmSync(dir, { force: true, recursive: true })
    }
  })

  it('keeps the count of an earlier app when a later one cannot be formatted', async () => {
    const dir = fs.mkdtempSync(path.join(process.cwd(), '.aqg-prettier-'))
    const messy = path.join(dir, 'a', 'messy.ts')
    const missing = path.join(dir, 'b', 'missing.ts')

    for (const app of ['a', 'b']) {
      fs.mkdirSync(path.join(dir, app))
      fs.writeFileSync(path.join(dir, app, 'package.json'), '{}', 'utf8')
    }

    fs.writeFileSync(messy, 'export const ready=true\n', 'utf8')
    const verifier = new Verifier({ ...baseConfig(), projectRoot: process.cwd() })

    try {
      const result = await verifier.runPrettier([messy, missing])

      expect(result.success).toBe(false)
      expect(result.formattedCount).toBe(1)
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0]).toMatchObject({ rule: RULE_NAMES.PRETTIER, file: missing })
    } finally {
      fs.rmSync(dir, { force: true, recursive: true })
    }
  })

  it('keeps the rewrite count when ESLint cannot parse another selected file', async () => {
    const dir = fs.mkdtempSync(path.join(process.cwd(), 'aqg-eslint-partial-'))
    const fixable = path.join(dir, 'fixable.js')
    const unparsable = path.join(dir, 'unparsable.js')
    fs.writeFileSync(fixable, 'var ready = true\nexport { ready }\n', 'utf8')
    fs.writeFileSync(unparsable, 'const value =\n', 'utf8')
    const verifier = new Verifier({ ...baseConfig(), projectRoot: process.cwd() })

    try {
      const result = await verifier.runLintFix([fixable, unparsable])

      expect(result.passed).toBe(false)
      expect(fs.readFileSync(fixable, 'utf8')).toContain('const ready = true')
      expect(result.fixedCount).toBe(1)
    } finally {
      fs.rmSync(dir, { force: true, recursive: true })
    }
  })

  it('fails when Prettier exits non-zero and does not count that file', async () => {
    const dir = fs.mkdtempSync(path.join(process.cwd(), '.aqg-prettier-'))
    const broken = path.join(dir, 'broken.ts')
    fs.writeFileSync(broken, 'const value =\n', 'utf8')
    const verifier = new Verifier({ ...baseConfig(), projectRoot: process.cwd() })

    try {
      const failed = await verifier.runPrettier([broken])

      expect(failed.success).toBe(false)
      expect(failed.formattedCount).toBe(0)
      expect(failed.issues[0]?.rule).toBe(RULE_NAMES.PRETTIER)
    } finally {
      fs.rmSync(dir, { force: true, recursive: true })
    }
  })
})
