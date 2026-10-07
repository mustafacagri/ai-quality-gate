import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { hasPlainJsScript, hasTypeScriptScript, readVueScriptLanguages } from '@/vue/scriptLanguages'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-script-languages-'))
})

afterEach(() => fs.rmSync(dir, { force: true, recursive: true }))

const sfc = (source: string): string => {
  const file = path.join(dir, 'Widget.vue')

  fs.writeFileSync(file, source, 'utf8')

  return file
}

describe('readVueScriptLanguages', () => {
  it.each([
    ['no lang is JavaScript', '<script>\nexport default {}\n</script>\n', ['js']],
    ['script setup with a lang', '<script setup lang="ts">\nconst a = 1\n</script>\n', ['ts']],
    ['lang is case-insensitive', '<script lang="TS">\nexport default {}\n</script>\n', ['ts']],
    [
      'both blocks',
      '<script lang="ts">\nexport default {}\n</script>\n<script setup lang="ts">\nconst a = 1\n</script>\n',
      ['ts', 'ts']
    ],
    ['an external script still declares its language', '<script lang="ts" src="./widget.ts"></script>\n', ['ts']],
    ['an unsupported language is reported as it is', '<script lang="coffee">\nx = 1\n</script>\n', ['coffee']],
    ['a file without a script has none', '<template><p>x</p></template>\n', []],
    ['a structurally invalid file has none', '<script lang="ts">\nconst a = 1\n', []]
  ])('%s', (_name, source, expected) => {
    expect(readVueScriptLanguages(sfc(source))).toEqual(expected)
  })

  it('has none for a missing file', () => {
    expect(readVueScriptLanguages(path.join(dir, 'Missing.vue'))).toEqual([])
  })
})

describe('script language predicates', () => {
  it('tells plain JavaScript from TypeScript, JSX included', () => {
    expect(hasPlainJsScript(sfc('<script lang="jsx">\nexport default {}\n</script>\n'))).toBe(true)
    expect(hasTypeScriptScript(sfc('<script lang="jsx">\nexport default {}\n</script>\n'))).toBe(false)
    expect(hasTypeScriptScript(sfc('<script lang="tsx">\nexport default {}\n</script>\n'))).toBe(true)
    expect(hasPlainJsScript(sfc('<script lang="tsx">\nexport default {}\n</script>\n'))).toBe(false)
  })

  it('treats an unsupported language and a file without a script as neither', () => {
    const coffee = sfc('<script lang="coffee">\nx = 1\n</script>\n')

    expect(hasPlainJsScript(coffee)).toBe(false)
    expect(hasTypeScriptScript(coffee)).toBe(false)
    expect(hasPlainJsScript(sfc('<template><p>x</p></template>\n'))).toBe(false)
  })

  it('counts a TypeScript script that lives in another file', () => {
    expect(hasTypeScriptScript(sfc('<script lang="ts" src="./widget.ts"></script>\n'))).toBe(true)
  })
})

describe('reading the same file again', () => {
  it('does not read or parse an unchanged file a second time', () => {
    const file = sfc('<script lang="ts">\nexport default {}\n</script>\n')
    const read = vi.spyOn(fs, 'readFileSync')

    readVueScriptLanguages(file)
    const readsAfterFirst = read.mock.calls.length

    expect(readVueScriptLanguages(file)).toEqual(['ts'])
    expect(read.mock.calls.length).toBe(readsAfterFirst)

    read.mockRestore()
  })

  it('sees an edit, even one that keeps the size, because the modification time moves', () => {
    const file = sfc('<script lang="ts">\nexport default {}\n</script>\n')

    expect(readVueScriptLanguages(file)).toEqual(['ts'])

    fs.writeFileSync(file, '<script lang="js">\nexport default {}\n</script>\n', 'utf8')
    fs.utimesSync(file, new Date(), new Date(Date.now() + 5000))

    expect(readVueScriptLanguages(file)).toEqual(['js'])
  })

  it('does not hand out the cached list itself, so a caller cannot change what the next one gets', () => {
    const file = sfc('<script lang="ts">\nexport default {}\n</script>\n')

    readVueScriptLanguages(file).push('changed')

    expect(readVueScriptLanguages(file)).toEqual(['ts'])
  })
})
