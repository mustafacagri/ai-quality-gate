import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { hasPath, matchDiskCase } from '@/utils/diskPath'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-disk-path-'))
})

afterEach(() => fs.rmSync(dir, { force: true, recursive: true }))

const write = (name: string): string => {
  const file = path.join(dir, name)

  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, 'x', 'utf8')

  return file
}

/** True where `CASE.ts` and `case.ts` are one file, as on macOS and Windows by default. */
const caseInsensitive = (): boolean => {
  const probe = path.join(dir, 'Probe.txt')

  fs.writeFileSync(probe, 'x', 'utf8')

  return fs.existsSync(path.join(dir, 'probe.txt'))
}

describe('matchDiskCase', () => {
  it('leaves a path whose parts exist exactly as they are', () => {
    const file = write(path.join('Src', 'Widget.ts'))

    expect(matchDiskCase(file)).toBe(file)
  })

  it('keeps a part that does not exist, and everything after it', () => {
    const missing = path.join(dir, 'Nowhere', 'Deeper', 'File.ts')

    expect(matchDiskCase(missing)).toBe(missing)
  })

  it('keeps the spelling of a directory it cannot read', () => {
    const file = path.join(dir, 'file.ts')

    fs.writeFileSync(file, 'x', 'utf8')

    expect(matchDiskCase(path.join(file, 'Inner.ts'))).toBe(path.join(file, 'Inner.ts'))
  })

  it.runIf(process.platform !== 'linux')('gives each part the case it has on disk', () => {
    if (!caseInsensitive()) return

    const file = write(path.join('Src', 'case.ts'))

    expect(matchDiskCase(path.join(dir, 'SRC', 'CASE.ts'))).toBe(file)
  })
})

describe('hasPath', () => {
  it('finds a path by its exact spelling without reading any directory', () => {
    expect(hasPath(new Set([path.join(dir, 'a.ts')]), path.join(dir, 'a.ts'))).toBe(true)
  })

  it('does not find a file that is not there', () => {
    expect(hasPath(new Set([path.join(dir, 'a.ts')]), path.join(dir, 'b.ts'))).toBe(false)
  })

  it('resolves a relative path first', () => {
    const relative = path.relative(process.cwd(), path.join(dir, 'a.ts'))

    expect(hasPath(new Set([path.join(dir, 'a.ts')]), relative)).toBe(true)
  })

  it.runIf(process.platform !== 'linux')(
    'finds a file spelled in another case where the file system treats them as one',
    () => {
      if (!caseInsensitive()) return

      const file = write('Listed.ts')

      expect(hasPath(new Set([file]), path.join(dir, 'LISTED.ts'))).toBe(true)
    }
  )
})
