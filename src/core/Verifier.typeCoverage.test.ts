import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Verifier } from '@/core/Verifier'
import { DEFAULT_FIXER_CONFIG, type Config } from '@/types'

let dir: string
let verifier: Verifier

const config = (): Config => ({
  projectRoot: dir,
  phase1Timeout: 120_000,
  phase2Timeout: 1,
  enableI18nRules: false,
  fixers: { ...DEFAULT_FIXER_CONFIG }
})

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-type-coverage-'))
  verifier = new Verifier(config())
})

afterEach(() => {
  // The spies sit on the prototype, so one that outlived its test would answer for every later Verifier.
  vi.restoreAllMocks()
  fs.rmSync(dir, { force: true, recursive: true })
})

const write = (name: string, content: string): string => {
  const file = path.join(dir, name)

  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content, 'utf8')

  return file
}

const tsconfig = (include: string[]): void => {
  write(
    'tsconfig.json',
    JSON.stringify({ compilerOptions: { strict: true, target: 'ES2022', skipLibCheck: true }, include })
  )
}

/** The private method every tool run goes through, so a test can watch it or answer in its place. */
interface ToolRuns {
  execCommand: (
    command: string,
    args: string[],
    options: { cwd: string; timeout: number }
  ) => Promise<{ exitCode: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }>
}

const toolRuns = (): ToolRuns => Verifier.prototype as unknown as ToolRuns

describe('Verifier does not pass a TypeScript file that no tsconfig includes', () => {
  it('fails a file outside the include, whose own errors tsc would never have reported', async () => {
    tsconfig(['src/main.ts'])
    write('src/main.ts', 'export const main = 1\n')
    const excluded = write('src/Excluded.ts', "export const broken: number = 'wrong'\n")

    const result = await verifier.runTypeCheck([excluded])

    expect(result.passed).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatchObject({ file: excluded, rule: 'typescript' })
    expect(result.errors[0]?.message).toContain('Not included by tsconfig.json: tsc did not type check this file')
  }, 120_000)

  it('accepts a file the included sources import, and checks it', async () => {
    tsconfig(['src/main.ts'])
    write('src/main.ts', "import { helper } from './helper'\n\nexport const main = helper\n")
    const helper = write('src/helper.ts', "export const helper: number = 'wrong'\n")

    const result = await verifier.runTypeCheck([helper])

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.message).toContain("Type 'string' is not assignable to type 'number'")
  }, 120_000)

  it('checks a TypeScript file through a composite project that a solution-style root references', async () => {
    write('tsconfig.json', JSON.stringify({ files: [], references: [{ path: './tsconfig.app.json' }] }))
    write(
      'tsconfig.app.json',
      JSON.stringify({
        compilerOptions: {
          composite: true,
          strict: true,
          target: 'ES2022',
          skipLibCheck: true,
          tsBuildInfoFile: './.cache/app.tsbuildinfo'
        },
        include: ['src/**/*.ts']
      })
    )
    const wrong = write('src/wrong.ts', "export const wrong: number = 'text'\n")

    const result = await verifier.runTypeCheck([wrong])

    expect(result.passed).toBe(false)
    expect(result.errors[0]?.message).toContain("Type 'string' is not assignable to type 'number'")
    expect(result.checkedProjects).toEqual([path.join(dir, 'tsconfig.app.json')])
    expect(fs.existsSync(path.join(dir, '.cache'))).toBe(false)
  }, 120_000)

  it('passes a file the tsconfig includes with one run of the checker and no file listing', async () => {
    tsconfig(['src/**/*.ts'])
    const included = write('src/a.ts', 'export const a: number = 1\n')
    const runs = vi.spyOn(toolRuns(), 'execCommand')

    expect(await verifier.runTypeCheck([included])).toMatchObject({ passed: true, errors: [] })
    expect(runs).toHaveBeenCalledTimes(1)
    expect(runs.mock.calls[0]?.[1]).not.toContain('--listFilesOnly')
  }, 120_000)

  it('does not pass an unlisted file when the file listing fails, even with the real checker for the main run', async () => {
    tsconfig(['src/main.ts'])
    write('src/main.ts', 'export const main = 1\n')
    const excluded = write('src/Excluded.ts', 'export const excluded = 1\n')
    const owner = toolRuns()
    const real = owner.execCommand.bind(verifier)

    vi.spyOn(owner, 'execCommand').mockImplementation((command, args, options) =>
      args.includes('--listFilesOnly')
        ? Promise.resolve({ exitCode: 2, signal: null, stdout: '', stderr: 'listing crashed' })
        : real(command, args, options)
    )

    const result = await verifier.runTypeCheck([excluded])

    expect(result).toMatchObject({ passed: false, status: 'ERROR' })
    expect(result.errors[0]?.message).toContain('listing crashed')
  }, 120_000)
})

describe('Verifier finds the program a file really belongs to', () => {
  it('checks a file that a referenced project only reaches through an import', async () => {
    write('tsconfig.json', JSON.stringify({ files: [], references: [{ path: './tsconfig.app.json' }] }))
    write(
      'tsconfig.app.json',
      JSON.stringify({
        compilerOptions: { strict: true, target: 'ES2022', skipLibCheck: true },
        include: ['src/main.ts']
      })
    )
    write('src/main.ts', "import { helper } from './helper'\n\nexport const main = helper\n")
    const helper = write('src/helper.ts', "export const helper: number = 'wrong'\n")

    const result = await verifier.runTypeCheck([helper])

    expect(result.passed).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.message).toContain("Type 'string' is not assignable to type 'number'")
    expect(result.checkedProjects).toEqual([path.join(dir, 'tsconfig.app.json')])
  }, 120_000)

  it('still refuses a file that no referenced project reaches', async () => {
    write('tsconfig.json', JSON.stringify({ files: [], references: [{ path: './tsconfig.app.json' }] }))
    write(
      'tsconfig.app.json',
      JSON.stringify({
        compilerOptions: { strict: true, target: 'ES2022', skipLibCheck: true },
        include: ['src/main.ts']
      })
    )
    write('src/main.ts', 'export const main = 1\n')
    const stray = write('scripts/stray.ts', 'export const stray = 1\n')

    const result = await verifier.runTypeCheck([stray])

    expect(result.passed).toBe(false)
    expect(result.errors[0]?.message).toContain('Not included by tsconfig.json')
  }, 120_000)

  it.runIf(process.platform !== 'linux')(
    'accepts a path spelled in another case where the file system treats them as one',
    async () => {
      tsconfig(['src/**/*.ts'])
      const real = write('src/case.ts', 'export const lower: number = 1\n')
      const upper = path.join(path.dirname(real), 'CASE.ts')

      if (!fs.existsSync(upper)) return

      const result = await verifier.runTypeCheck([upper])

      expect(result).toMatchObject({ passed: true, errors: [] })
    },
    120_000
  )
})
