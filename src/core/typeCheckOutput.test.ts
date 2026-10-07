import path from 'node:path'

import { describe, expect, it } from 'vitest'

import type { CommandResult } from '@/core/commandResult'
import type { Issue } from '@/types'
import { MAX_REPORTED_DIAGNOSTICS, parseTypeCheckCommand, sameDiagnostic } from '@/core/typeCheckOutput'

const configPath = path.join(path.sep, 'app', 'tsconfig.json')
const result = (overrides: Partial<CommandResult>): CommandResult => ({
  exitCode: 2,
  signal: null,
  stdout: '',
  stderr: '',
  ...overrides
})

const onlyIssue = (issues: Issue[]): Issue => {
  const [issue] = issues

  if (issue === undefined || issues.length !== 1) throw new Error('expected exactly one issue')

  return issue
}

describe('parseTypeCheckCommand', () => {
  it('reads file diagnostics with their line, column and message', () => {
    const parsed = parseTypeCheckCommand(
      result({ stdout: "src/a.ts(3,7): error TS2322: Type 'string' is not assignable to type 'number'." }),
      ['src/a.ts'],
      configPath
    )

    expect(parsed).toMatchObject({ passed: false, status: 'FAIL' })
    expect(parsed.errors).toEqual([
      {
        rule: 'typescript',
        file: path.join(path.dirname(configPath), 'src', 'a.ts'),
        line: 3,
        column: 7,
        message: "Type 'string' is not assignable to type 'number'.",
        severity: 'error'
      }
    ])
  })

  it('reports an error in a file nobody selected as well, after the selected ones', () => {
    const parsed = parseTypeCheckCommand(
      result({
        stdout: 'src/other.ts(1,1): error TS2304: Cannot find name x.\nsrc/a.ts(2,2): error TS2304: Cannot find name y.'
      }),
      ['src/a.ts'],
      configPath
    )

    expect(parsed.errors.map(issue => issue.file)).toEqual([
      path.join(path.dirname(configPath), 'src', 'a.ts'),
      path.join(path.dirname(configPath), 'src', 'other.ts')
    ])
    expect(parsed.status).toBe('FAIL')
  })

  it('reads a path that has parentheses of its own, such as a Next.js route group', () => {
    const parsed = parseTypeCheckCommand(
      result({ stdout: "app/(auth)/page.tsx(3,5): error TS2322: Type 'a' is not assignable to type 'b'." }),
      ['app/(auth)/page.tsx'],
      configPath
    )

    expect(parsed.errors).toEqual([
      expect.objectContaining({
        file: path.join(path.dirname(configPath), 'app', '(auth)', 'page.tsx'),
        line: 3,
        column: 5,
        message: "Type 'a' is not assignable to type 'b'."
      })
    ])
  })

  it('resolves a relative path against the project, so two packages with the same relative path stay apart', () => {
    const first = parseTypeCheckCommand(
      result({ stdout: 'src/index.ts(1,1): error TS2304: Cannot find name x.' }),
      [],
      path.join(path.sep, 'repo', 'packages', 'a', 'tsconfig.json')
    )
    const second = parseTypeCheckCommand(
      result({ stdout: 'src/index.ts(1,1): error TS2304: Cannot find name x.' }),
      [],
      path.join(path.sep, 'repo', 'packages', 'b', 'tsconfig.json')
    )

    expect(first.errors[0]?.file).toBe(path.join(path.sep, 'repo', 'packages', 'a', 'src', 'index.ts'))
    expect(sameDiagnostic(onlyIssue(first.errors), onlyIssue(second.errors))).toBe(false)
  })

  it.each([
    'src/a.ts(x,1): error TS2304: bad line',
    'src/a.ts(1): error TS2304: no column',
    'src/a.ts(1,2,3): error TS2304: too many positions',
    'src/a.ts(1,1): error TSabc: not a code',
    '(1,1): error TS2304: no file'
  ])('does not read %j as a diagnostic', line => {
    expect(() => parseTypeCheckCommand(result({ stdout: line }), ['src/a.ts'], configPath)).toThrow()
  })

  it('reports a diagnostic that belongs to no file against the tsconfig', () => {
    const parsed = parseTypeCheckCommand(
      result({ stdout: "error TS18003: No inputs were found in config file 'tsconfig.json'." }),
      ['src/a.ts'],
      configPath
    )

    expect(parsed.errors).toEqual([
      expect.objectContaining({
        file: configPath,
        line: 0,
        message: "No inputs were found in config file 'tsconfig.json'."
      })
    ])
  })

  it('ignores the indented continuation lines of a multi-line message', () => {
    const parsed = parseTypeCheckCommand(
      result({
        stdout:
          "src/a.ts(1,1): error TS2322: Type 'A' is not assignable to type 'B'.\n  Types of property 'x' are incompatible."
      }),
      ['src/a.ts'],
      configPath
    )

    expect(parsed.errors).toHaveLength(1)
  })

  it('marks a deprecation as a warning', () => {
    const parsed = parseTypeCheckCommand(
      result({ stdout: "src/a.ts(1,1): error TS6385: 'x' is deprecated." }),
      ['src/a.ts'],
      configPath
    )

    expect(parsed.errors[0]).toMatchObject({ rule: 'typescript:deprecated', severity: 'warning' })
  })

  it('cuts a flood of diagnostics off and says how many are hidden', () => {
    const lines = Array.from(
      { length: MAX_REPORTED_DIAGNOSTICS + 3 },
      (_unused, index) => `src/f${String(index)}.ts(1,1): error TS2304: Cannot find name z.`
    )
    const parsed = parseTypeCheckCommand(result({ stdout: lines.join('\n') }), ['src/f0.ts'], configPath)

    expect(parsed.errors).toHaveLength(MAX_REPORTED_DIAGNOSTICS + 1)
    expect(parsed.errors.at(-1)).toMatchObject({ file: configPath, message: '3 more TypeScript errors are not shown.' })
  })

  it('passes on a clean exit with no output', () => {
    expect(parseTypeCheckCommand(result({ exitCode: 0 }), ['src/a.ts'], configPath)).toEqual({
      passed: true,
      status: 'PASS',
      errors: []
    })
  })

  it.each([
    ['output that is not a diagnostic', result({ exitCode: 2, stderr: 'Tool crashed' })],
    ['a failing exit with no output', result({ exitCode: 2 })],
    ['a killed process', result({ exitCode: null, signal: 'SIGTERM' })]
  ])('treats %s as a tool failure, not as a finding', (_name, failing) => {
    expect(() => parseTypeCheckCommand(failing, ['src/a.ts'], configPath)).toThrow()
  })
})

describe('sameDiagnostic', () => {
  const issue = { rule: 'typescript', file: 'a.ts', line: 1, column: 2, message: 'm', severity: 'error' as const }

  it('is true only when every field matches', () => {
    expect(sameDiagnostic(issue, { ...issue })).toBe(true)
    expect(sameDiagnostic(issue, { ...issue, line: 2 })).toBe(false)
    expect(sameDiagnostic(issue, { ...issue, message: 'n' })).toBe(false)
  })
})
