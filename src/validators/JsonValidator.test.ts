import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { JsonValidator } from '@/validators/JsonValidator'

const makeTempDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-json-'))

describe('JsonValidator', () => {
  it('fails when file starts with UTF-8 BOM', async () => {
    const dir = makeTempDir()
    const file = path.join(dir, 'data.json')

    fs.writeFileSync(file, `\uFEFF${JSON.stringify({ a: 1 })}\n`, 'utf8')

    const validator = new JsonValidator()
    const result = await validator.validate([file])

    expect(result.passed).toBe(false)
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]?.message).toMatch(/BOM/i)
  })

  it('reports parse error for invalid JSON', async () => {
    const dir = makeTempDir()
    const file = path.join(dir, 'bad.json')

    fs.writeFileSync(file, '{ invalid json', 'utf8')

    const validator = new JsonValidator()
    const result = await validator.validate([file])

    expect(result.passed).toBe(false)
    expect(result.issues[0]?.rule).toBe('json/parse-error')
    expect(result.issues[0]?.message.length).toBeGreaterThan(0)
  })

  it('detects extra key in locale file vs reference (i18n pattern)', async () => {
    const dir = makeTempDir()
    const locales = path.join(dir, 'locales')

    fs.mkdirSync(locales, { recursive: true })

    const en = path.join(locales, 'en.json')
    const tr = path.join(locales, 'tr.json')

    fs.writeFileSync(en, JSON.stringify({ hello: 'Hello' }), 'utf8')
    fs.writeFileSync(tr, JSON.stringify({ hello: 'Merhaba', extra: 'x' }), 'utf8')

    const validator = new JsonValidator()
    const result = await validator.validate([en, tr])

    expect(result.passed).toBe(true)
    expect(result.i18nIssues.some(i => i.type === 'extra_key' && i.key === 'extra')).toBe(true)
  })

  it('detects missing key in locale file vs reference', async () => {
    const dir = makeTempDir()
    const locales = path.join(dir, 'locales')

    fs.mkdirSync(locales, { recursive: true })

    const en = path.join(locales, 'en.json')
    const tr = path.join(locales, 'tr.json')

    fs.writeFileSync(en, JSON.stringify({ hello: 'Hello', onlyEn: 'y' }), 'utf8')
    fs.writeFileSync(tr, JSON.stringify({ hello: 'Merhaba' }), 'utf8')

    const validator = new JsonValidator()
    const result = await validator.validate([en, tr])

    expect(result.i18nIssues.some(i => i.type === 'missing_key' && i.key === 'onlyEn')).toBe(true)
  })

  it('passes for valid minimal JSON', async () => {
    const dir = makeTempDir()
    const file = path.join(dir, 'ok.json')

    fs.writeFileSync(file, '{"a":true}', 'utf8')

    const validator = new JsonValidator()
    const result = await validator.validate([file])

    expect(result.passed).toBe(true)
    expect(result.validCount).toBe(1)
    expect(result.issues).toHaveLength(0)
  })

  it('reports incomplete JSON with friendly message', async () => {
    const dir = makeTempDir()
    const file = path.join(dir, 'cut.json')

    fs.writeFileSync(file, '{"a":', 'utf8')

    const validator = new JsonValidator()
    const result = await validator.validate([file])

    expect(result.passed).toBe(false)
    expect(result.issues[0]?.message).toMatch(/Incomplete JSON|Unexpected end/i)
  })

  it('reports trailing comma with friendly message', async () => {
    const dir = makeTempDir()
    const file = path.join(dir, 'trail.json')

    fs.writeFileSync(file, '{"a":1,}', 'utf8')

    const validator = new JsonValidator()
    const result = await validator.validate([file])

    expect(result.passed).toBe(false)
    expect(result.issues[0]?.message.toLowerCase()).toMatch(/comma|trailing|unexpected|double-quoted|property/)
  })

  it('includes nested keys in i18n consistency', async () => {
    const dir = makeTempDir()
    const locales = path.join(dir, 'locales')

    fs.mkdirSync(locales, { recursive: true })

    const en = path.join(locales, 'en.json')
    const tr = path.join(locales, 'tr.json')

    fs.writeFileSync(en, JSON.stringify({ nav: { home: 'Home' } }), 'utf8')
    fs.writeFileSync(tr, JSON.stringify({ nav: { home: 'Ana' } }), 'utf8')

    const validator = new JsonValidator()
    const result = await validator.validate([en, tr])

    expect(result.passed).toBe(true)
  })

  it('does not run consistency check when only one locale file is present', async () => {
    const dir = makeTempDir()
    const locales = path.join(dir, 'locales2')

    fs.mkdirSync(locales, { recursive: true })

    const en = path.join(locales, 'en.json')

    fs.writeFileSync(en, JSON.stringify({ a: 1 }), 'utf8')

    const validator = new JsonValidator()
    const result = await validator.validate([en])

    expect(result.passed).toBe(true)
    expect(result.i18nIssues).toHaveLength(0)
  })

  it('reports ENOENT-style errors as json/parse-error with generic message', async () => {
    const dir = makeTempDir()
    const missing = path.join(dir, 'missing.json')
    const validator = new JsonValidator()
    const result = await validator.validate([missing])

    expect(result.passed).toBe(false)
    expect(result.issues[0]?.rule).toBe('json/parse-error')
    expect(result.issues[0]?.message).toMatch(/JSON parse error/)
  })

  it('treats array values as leaves when extracting i18n keys', async () => {
    const dir = makeTempDir()
    const locales = path.join(dir, 'locales')

    fs.mkdirSync(locales, { recursive: true })

    const en = path.join(locales, 'en.json')
    const tr = path.join(locales, 'tr.json')

    fs.writeFileSync(en, JSON.stringify({ items: ['a'] }), 'utf8')
    fs.writeFileSync(tr, JSON.stringify({ items: ['b'], onlyTr: true }), 'utf8')

    const validator = new JsonValidator()
    const result = await validator.validate([en, tr])

    expect(result.i18nIssues.some(i => i.type === 'extra_key' && i.key === 'onlyTr')).toBe(true)
  })
})
