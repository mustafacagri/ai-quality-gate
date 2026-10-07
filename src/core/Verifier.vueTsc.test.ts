import fs from 'node:fs'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Verifier } from '@/core/Verifier'
import { DEFAULT_FIXER_CONFIG, type Config } from '@/types'

/** Inside the repo, so the `vue` package resolves from node_modules as it does in a real Vue project. */
let dir: string
let verifier: Verifier

const COMPILER_OPTIONS = {
  target: 'ESNext',
  module: 'ESNext',
  moduleResolution: 'bundler',
  strict: true,
  jsx: 'preserve',
  skipLibCheck: true,
  lib: ['ESNext', 'DOM']
}

const config = (): Config => ({
  projectRoot: dir,
  phase1Timeout: 120_000,
  phase2Timeout: 1,
  enableI18nRules: false,
  fixers: { ...DEFAULT_FIXER_CONFIG }
})

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(process.cwd(), 'aqg-vue-tsc-'))
  verifier = new Verifier(config())
})

afterEach(() => fs.rmSync(dir, { force: true, recursive: true }))

const write = (name: string, content: string): string => {
  const file = path.join(dir, name)

  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content, 'utf8')

  return file
}

const tsconfig = (name: string, extra: object): void => {
  write(name, JSON.stringify({ compilerOptions: COMPILER_OPTIONS, ...extra }))
}

const typed = (script: string, template = '<p>ok</p>'): string =>
  `<script setup lang="ts">\n${script}\n</script>\n<template>${template}</template>\n`

describe('Verifier type checks Vue files with vue-tsc', () => {
  it('reports a type error in the script at its line in the .vue file', async () => {
    tsconfig('tsconfig.json', { include: ['src/**/*.vue', 'src/**/*.ts'] })
    const widget = write('src/Widget.vue', typed("const total: number = 'text'"))

    const result = await verifier.runTypeCheck([widget])

    expect(result.passed).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatchObject({ file: widget, line: 2, rule: 'typescript' })
    expect(result.errors[0]?.message).toContain("Type 'string' is not assignable to type 'number'")
  }, 120_000)

  it('reports a type error in the template expression', async () => {
    tsconfig('tsconfig.json', { include: ['src/**/*.vue'] })
    const widget = write('src/Widget.vue', typed("const label = 'a'", '<p>{{ label.nope }}</p>'))

    const result = await verifier.runTypeCheck([widget])

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.message).toContain("Property 'nope' does not exist")
  }, 120_000)

  it('passes a Vue file with a correct script', async () => {
    tsconfig('tsconfig.json', { include: ['src/**/*.vue'] })
    const widget = write('src/Widget.vue', typed('const total: number = 1', '<p>{{ total }}</p>'))

    expect(await verifier.runTypeCheck([widget])).toMatchObject({ passed: true, errors: [] })
  }, 120_000)

  it('checks a file through the project a create-vue style root config references', async () => {
    write('tsconfig.json', JSON.stringify({ files: [], references: [{ path: './tsconfig.app.json' }] }))
    tsconfig('tsconfig.app.json', { include: ['src/**/*.vue'] })
    const widget = write('src/Widget.vue', typed("const total: number = 'text'"))

    const result = await verifier.runTypeCheck([widget])

    expect(result.passed).toBe(false)
    expect(result.errors[0]).toMatchObject({ file: widget, line: 2 })
    expect(result.checkedProjects).toEqual([path.join(dir, 'tsconfig.app.json')])
  }, 120_000)

  it('counts the verdict of every project that includes the file, and reports a shared error once', async () => {
    write(
      'tsconfig.json',
      JSON.stringify({ files: [], references: [{ path: './tsconfig.loose.json' }, { path: './tsconfig.strict.json' }] })
    )
    tsconfig('tsconfig.loose.json', {
      include: ['src/**/*.vue'],
      compilerOptions: { ...COMPILER_OPTIONS, strict: false }
    })
    tsconfig('tsconfig.strict.json', { include: ['src/**/*.vue'] })
    const lenient = write('src/Lenient.vue', typed('const keep = (input) => input\nexport { keep }'))

    const strictOnly = await verifier.runTypeCheck([lenient])

    fs.rmSync(lenient)

    const wrong = write('src/Wrong.vue', typed("const total: number = 'text'"))
    const sharedError = await verifier.runTypeCheck([wrong])

    expect(strictOnly.passed).toBe(false)
    expect(strictOnly.errors[0]?.message).toContain("implicitly has an 'any' type")
    expect(sharedError.errors).toHaveLength(1)
  }, 120_000)

  it('reports an error in another file of the program too, instead of an opaque tool failure', async () => {
    tsconfig('tsconfig.json', { include: ['src/**/*.vue'] })
    const good = write('src/Good.vue', typed('const total: number = 1'))
    const bad = write('src/Bad.vue', typed("const total: number = 'text'"))

    const result = await verifier.runTypeCheck([good])

    expect(result.passed).toBe(false)
    expect(result.status).toBe('FAIL')
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatchObject({ file: bad, line: 2 })
  }, 120_000)

  it('refuses to pass a Vue file that no tsconfig includes', async () => {
    tsconfig('tsconfig.json', { include: ['src/**/*.ts'] })
    write('src/main.ts', 'export const main = 1\n')
    const widget = write('src/Widget.vue', typed('const total: number = 1'))

    const result = await verifier.runTypeCheck([widget])

    expect(result.passed).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatchObject({ file: widget, rule: 'typescript' })
    expect(result.errors[0]?.message).toContain('Not included by tsconfig.json')
  }, 120_000)

  it('accepts a Vue file the included sources import, and checks it', async () => {
    tsconfig('tsconfig.json', { include: ['src/**/*.ts'] })
    write('src/main.ts', "import Widget from './Widget.vue'\n\nexport { Widget }\n")
    const widget = write('src/Widget.vue', typed("const total: number = 'text'"))

    const result = await verifier.runTypeCheck([widget])

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.message).toContain("Type 'string' is not assignable to type 'number'")
  }, 120_000)

  it('type checks a TypeScript file of a Vue project with vue-tsc, so it can import a .vue module', async () => {
    tsconfig('tsconfig.json', { include: ['src/**/*.ts', 'src/**/*.vue'] })
    const main = write('src/main.ts', "import Widget from './Widget.vue'\n\nexport { Widget }\n")

    write('src/Widget.vue', typed('const total: number = 1'))

    expect(await verifier.runTypeCheck([main])).toMatchObject({ passed: true, errors: [] })
  }, 120_000)
})

describe('Verifier leaves Vue files without TypeScript alone', () => {
  it('does not type check a plain-JavaScript Vue file and does not ask for a tsconfig', async () => {
    const plain = write('src/Plain.vue', '<script>\nexport default {}\n</script>\n')

    expect(await verifier.runTypeCheck([plain])).toMatchObject({ passed: true, errors: [] })
  })

  it('asks for a tsconfig when a TypeScript Vue file has none, as for a .ts file', async () => {
    const widget = write('src/Widget.vue', typed('const total: number = 1'))

    const result = await verifier.runTypeCheck([widget])

    expect(result.passed).toBe(false)
    expect(result.errors[0]?.message).toContain('No tsconfig.json found')
  })
})

const importsVue = (): string => write('src/main.ts', "import Widget from './Widget.vue'\n\nexport { Widget }\n")

describe('Verifier uses vue-tsc for a TypeScript file that only imports a Vue file', () => {
  it('when the project depends on vue, so the import resolves', async () => {
    write('package.json', JSON.stringify({ name: 'app', dependencies: { vue: '^3.5.0' } }))
    tsconfig('tsconfig.json', { include: ['src/**/*.ts'] })
    const main = importsVue()

    write('src/Widget.vue', typed('const total: number = 1'))

    expect(await verifier.runTypeCheck([main])).toMatchObject({ passed: true, errors: [] })
  }, 120_000)

  it('and reports a type error in that Vue file, which tsc could not even open', async () => {
    write('package.json', JSON.stringify({ name: 'app', devDependencies: { vue: '^3.5.0' } }))
    tsconfig('tsconfig.json', { include: ['src/**/*.ts'] })
    const main = importsVue()

    write('src/Widget.vue', typed("const total: number = 'text'"))

    const result = await verifier.runTypeCheck([main])

    expect(result.passed).toBe(false)
    expect(result.errors[0]?.message).toContain("Type 'string' is not assignable to type 'number'")
  }, 120_000)

  it('but not when the project does not depend on vue, which keeps tsc and its plain behavior', async () => {
    write('package.json', JSON.stringify({ name: 'lib', dependencies: {} }))
    tsconfig('tsconfig.json', { include: ['src/**/*.ts'] })
    const main = importsVue()

    write('src/Widget.vue', typed('const total: number = 1'))

    const result = await verifier.runTypeCheck([main])

    expect(result.passed).toBe(false)
    expect(result.errors[0]?.message).toContain('Cannot find module')
  }, 120_000)
})
