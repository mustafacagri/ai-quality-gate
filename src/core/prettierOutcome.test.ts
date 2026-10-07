import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { CommandResult } from '@/core/commandResult'
import { countChangedFiles, prettierFailureFile } from '@/core/prettierOutcome'

const result = (overrides: Partial<CommandResult>): CommandResult => ({
  exitCode: 2,
  signal: null,
  stdout: '',
  stderr: '',
  ...overrides
})

describe('prettierFailureFile', () => {
  const appDir = path.join(path.sep, 'app')
  const files = [path.join(appDir, 'src', 'data.ts'), path.join(appDir, 'src', 'a.ts')]

  it('names the file Prettier reported, matching the path relative to its cwd', () => {
    const output = result({
      stderr: `[error] ${path.join('src', 'a.ts')}: SyntaxError: Unexpected token\n[error] > 1 | x\n`
    })

    expect(prettierFailureFile(output, appDir, files)).toBe(files[1])
  })

  it('does not mistake a file whose name ends with the reported one', () => {
    const output = result({ stderr: `[error] ${path.join('src', 'a.ts')}: SyntaxError\n` })

    expect(prettierFailureFile(output, appDir, [files[0] ?? '', files[1] ?? ''])).toBe(files[1])
  })

  it('falls back to the first file when the output names none of them', () => {
    expect(prettierFailureFile(result({ stderr: 'boom' }), appDir, files)).toBe(files[0])
  })
})

describe('countChangedFiles', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-changed-'))
  })

  afterEach(() => fs.rmSync(dir, { force: true, recursive: true }))

  it('counts zero when nothing changed and every changed file when several did', () => {
    const first = path.join(dir, 'first.ts')
    const second = path.join(dir, 'second.ts')

    fs.writeFileSync(first, 'a', 'utf8')
    fs.writeFileSync(second, 'b', 'utf8')

    expect(
      countChangedFiles(
        [first, second],
        new Map([
          [first, 'a'],
          [second, 'b']
        ])
      )
    ).toBe(0)
    expect(
      countChangedFiles(
        [first, second],
        new Map([
          [first, 'x'],
          [second, 'y']
        ])
      )
    ).toBe(2)
  })

  it('counts only files whose content differs from the snapshot', () => {
    const same = path.join(dir, 'same.ts')
    const changed = path.join(dir, 'changed.ts')

    fs.writeFileSync(same, 'a', 'utf8')
    fs.writeFileSync(changed, 'b', 'utf8')

    const before = new Map([
      [same, 'a'],
      [changed, 'old']
    ])

    expect(countChangedFiles([same, changed], before)).toBe(1)
  })
})
