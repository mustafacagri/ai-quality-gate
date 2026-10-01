import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Verifier } from '@/core/Verifier'
import { DEFAULT_FIXER_CONFIG, type Config } from '@/types/config'

let projectRoot: string
let file: string
let verifier: Verifier
const child = (exitCode: number | null, stdout: string, extra: object = {}) => ({
  exitCode,
  signal: null,
  stdout,
  stderr: '',
  ...extra
})
const report = (filePath: string, messages: object[] = []) => JSON.stringify([{ filePath, messages }])

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-child-contract-'))
  file = path.join(projectRoot, 'selected.ts')
  fs.writeFileSync(file, 'export const READY = true\n')
  fs.writeFileSync(path.join(projectRoot, 'tsconfig.json'), JSON.stringify({ files: ['selected.ts'] }))
  const config: Config = {
    projectRoot,
    phase1Timeout: 30_000,
    phase2Timeout: 30_000,
    enableI18nRules: false,
    fixers: { ...DEFAULT_FIXER_CONFIG }
  }
  verifier = new Verifier(config)
})
afterEach(() => fs.rmSync(projectRoot, { recursive: true, force: true }))

function mockChild(result: object): void {
  Reflect.set(verifier, 'execCommand', vi.fn().mockResolvedValue(result))
}

describe('independent lint child contract', () => {
  it('accepts accounted exit-zero coverage and rejects missing source', async () => {
    mockChild(child(0, report(file)))
    expect(await verifier.runLintCheck([file])).toMatchObject({ passed: true, status: 'PASS', scannedFiles: [file] })
    fs.unlinkSync(file)
    expect(await verifier.runLintCheck([file])).toMatchObject({ passed: false, status: 'ERROR' })
  })

  it.each([1, 2])('retains severity %i findings on a normal exit-one', async severity => {
    mockChild(
      child(1, report(file, [{ ruleId: 'independent-rule', severity, message: 'Finding', line: 1, column: 1 }]))
    )
    const result = await verifier.runLintCheck([file])
    expect(result).toMatchObject({ passed: false, status: 'FAIL' })
    expect(result.errors[0]?.rule).toBe('independent-rule')
  })

  it.each([
    ['tool exit', 2, '[]', {}],
    ['spawn error', null, '', { error: 'ENOENT' }],
    ['signal', null, '', { signal: 'SIGTERM' }],
    ['timeout', null, '', { signal: 'SIGTERM', stderr: 'Timed out' }],
    ['empty', 0, '', {}],
    ['stderr only', 0, '', { stderr: 'Fatal error' }],
    ['malformed', 0, '[', {}],
    ['non-array', 0, '{}', {}],
    ['missing coverage', 0, '[]', {}],
    ['unexpected path', 0, '[{"filePath":"/unrequested.ts","messages":[]}]', {}],
    ['missing message shape', 0, '[{"filePath":"selected.ts","messages":[{}]}]', {}],
    ['unaccounted findings', 1, '', {}]
  ])('reports %s as ERROR', async (_name, exitCode, stdout, extra) => {
    mockChild(child(exitCode, stdout, extra))
    expect(await verifier.runLintCheck([file])).toMatchObject({ passed: false, status: 'ERROR' })
  })

  it('rejects duplicate paths, fatal parser diagnostics and rejected promises', async () => {
    mockChild(
      child(
        0,
        JSON.stringify([
          { filePath: file, messages: [] },
          { filePath: file, messages: [] }
        ])
      )
    )
    expect(await verifier.runLintCheck([file])).toMatchObject({ status: 'ERROR' })
    mockChild(child(1, report(file, [{ ruleId: null, severity: 2, message: 'Cannot parse', fatal: true }])))
    expect(await verifier.runLintCheck([file])).toMatchObject({ status: 'ERROR' })
    Reflect.set(verifier, 'execCommand', vi.fn().mockRejectedValue(new Error('Child rejected')))
    expect(await verifier.runLintCheck([file])).toMatchObject({ status: 'ERROR' })
  })
})

describe('independent TypeScript child contract', () => {
  it.each([
    child(2, ''),
    child(0, '', { stderr: 'Tool crashed without diagnostics' }),
    child(1, 'Tool failed'),
    child(null, '', { signal: 'SIGTERM' }),
    child(null, '', { error: 'ENOENT' })
  ])('never turns a compiler failure into PASS', async result => {
    mockChild(result)
    expect(await verifier.runTypeCheck([file])).toMatchObject({ passed: false, status: 'ERROR' })
  })

  it('retains genuine compiler findings', async () => {
    mockChild(child(2, `${file}(1,1): error TS2322: Assignment is invalid`))
    expect(await verifier.runTypeCheck([file])).toMatchObject({ passed: false, status: 'FAIL' })
  })
})
