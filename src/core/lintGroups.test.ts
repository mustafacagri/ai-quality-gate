import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { VUE_PLAIN_JS_SCRIPT, VUE_SCRIPT_LANG_ENV } from '@/constants/vue'
import { CHECK_STATUS } from '@/constants/verification'
import { groupLintFilesByScriptLanguage, mergeLintResults } from '@/core/lintGroups'
import type { LintResult } from '@/types'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-lint-groups-'))
})

afterEach(() => fs.rmSync(dir, { force: true, recursive: true }))

const write = (name: string, source: string): string => {
  const file = path.join(dir, name)

  fs.writeFileSync(file, source, 'utf8')

  return file
}

describe('groupLintFilesByScriptLanguage', () => {
  it('puts a Vue file with a plain script in its own group and leaves the rest together', () => {
    const plain = write('Plain.vue', '<script>\nexport default {}\n</script>\n')
    const jsx = write('Jsx.vue', '<script lang="jsx">\nexport default {}\n</script>\n')
    const setupJs = write('SetupJs.vue', '<script setup>\nconst a = 1\n</script>\n')
    const typed = write('Typed.vue', '<script setup lang="ts">\nconst a: number = 1\n</script>\n')
    const tsx = write('Tsx.vue', '<script lang="tsx">\nexport default {}\n</script>\n')
    const source = write('source.ts', 'export const a = 1\n')

    const groups = groupLintFilesByScriptLanguage([plain, typed, source, jsx, setupJs, tsx])

    expect(groups).toEqual([
      { files: [typed, source, tsx], env: {} },
      { files: [plain, jsx, setupJs], env: { [VUE_SCRIPT_LANG_ENV]: VUE_PLAIN_JS_SCRIPT } }
    ])
  })

  it('does not treat a file without a script, with a broken structure, or that is missing as plain JavaScript', () => {
    const noScript = write('NoScript.vue', '<template><p>x</p></template>\n')
    const broken = write('Broken.vue', '<script>\nconst a = 1\n')
    const missing = path.join(dir, 'Missing.vue')

    expect(groupLintFilesByScriptLanguage([noScript, broken, missing])).toEqual([
      { files: [noScript, broken, missing], env: {} }
    ])
  })

  it('returns no group for no files', () => {
    expect(groupLintFilesByScriptLanguage([])).toEqual([])
  })
})

describe('mergeLintResults', () => {
  const result = (overrides: Partial<LintResult>): LintResult => ({
    passed: true,
    status: CHECK_STATUS.PASS,
    scannedFiles: [],
    hasErrors: false,
    fixedCount: 0,
    errors: [],
    ...overrides
  })

  it('sums rewrites and keeps every finding and scanned file', () => {
    const finding = { rule: 'no-var', file: 'a.vue', line: 1, message: 'm', severity: 'error' as const }
    const merged = mergeLintResults([
      result({ scannedFiles: ['a.ts'], fixedCount: 2 }),
      result({
        passed: false,
        status: CHECK_STATUS.FAIL,
        scannedFiles: ['a.vue'],
        hasErrors: true,
        fixedCount: 1,
        errors: [finding]
      })
    ])

    expect(merged).toEqual({
      passed: false,
      status: CHECK_STATUS.FAIL,
      scannedFiles: ['a.ts', 'a.vue'],
      hasErrors: true,
      fixedCount: 3,
      errors: [finding]
    })
  })

  it.each([
    [[CHECK_STATUS.PASS, CHECK_STATUS.PASS], CHECK_STATUS.PASS],
    [[CHECK_STATUS.PASS, CHECK_STATUS.FAIL], CHECK_STATUS.FAIL],
    [[CHECK_STATUS.FAIL, CHECK_STATUS.ERROR, CHECK_STATUS.PASS], CHECK_STATUS.ERROR]
  ])('reports the worst status of %j', (statuses, expected) => {
    const merged = mergeLintResults(statuses.map(status => result({ status, passed: status === CHECK_STATUS.PASS })))

    expect(merged.status).toBe(expected)
    expect(merged.passed).toBe(expected === CHECK_STATUS.PASS)
  })
})
