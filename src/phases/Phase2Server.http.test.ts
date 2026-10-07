/**
 * Phase 2 against a local HTTP server that answers like SonarQube, with a real `sonar-scanner` stand-in script.
 * Nothing in the HTTP client or the process spawning is mocked.
 */

import fs from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { QualityGate } from '@/core/QualityGate'
import { Phase2Server } from '@/phases/Phase2Server'
import { DEFAULT_FIXER_CONFIG, type Config } from '@/types'

interface SonarRequest {
  readonly path: string
  readonly authorization: string | undefined
}

interface FakeSonar {
  readonly url: string
  readonly requests: SonarRequest[]
  readonly close: () => Promise<void>
}

type Responder = (requestPath: string) => { status: number; body: unknown }

const startSonar = async (respond: Responder): Promise<FakeSonar> => {
  const requests: SonarRequest[] = []
  const server = http.createServer((request, response) => {
    const requestPath = (request.url ?? '').split('?')[0] ?? ''
    const { status, body } = respond(requestPath)

    requests.push({ path: requestPath, authorization: request.headers.authorization })
    response.writeHead(status, { 'content-type': 'application/json' })
    response.end(JSON.stringify(body))
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })

  const { port } = server.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${String(port)}`,
    requests,
    close: () =>
      new Promise<void>(resolve => {
        server.closeAllConnections()
        server.close(() => resolve())
      })
  }
}

const ok =
  (issues: object[] = [], taskStatus = 'SUCCESS'): Responder =>
  requestPath => {
    if (requestPath === '/api/issues/search') return { status: 200, body: { issues } }

    if (requestPath === '/api/ce/activity') return { status: 200, body: { tasks: [{ status: taskStatus }] } }

    return { status: 200, body: {} }
  }

let dir: string
let sonar: FakeSonar | undefined

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-sonar-'))
})

afterEach(async () => {
  await sonar?.close()
  sonar = undefined
  fs.rmSync(dir, { force: true, recursive: true })
})

/** A script named `sonar-scanner`, the only name Phase 2 will run besides `npx`. */
const writeScanner = (body: string): string => {
  const scanner = path.join(dir, 'sonar-scanner')

  fs.writeFileSync(scanner, `#!/bin/sh\n${body}\n`, { mode: 0o755 })

  return scanner
}

const configFor = (url: string, scanner: string, overrides: Partial<Config> = {}): Config => ({
  projectRoot: dir,
  phase1Timeout: 120_000,
  phase2Timeout: 30_000,
  enableI18nRules: false,
  fixers: { ...DEFAULT_FIXER_CONFIG },
  sonarHostUrl: url,
  sonarToken: 'secret-token',
  sonarProjectKey: 'proj',
  sonarScannerPath: scanner,
  ...overrides
})

const runGate = (url: string, file: string): ReturnType<QualityGate['run']> =>
  new QualityGate(configFor(url, writeScanner('exit 0'), { projectRoot: process.cwd() })).run([file])

const sonarIssue = (component: string, line: number, severity = 'CRITICAL') => ({
  rule: 'typescript:S1234',
  component: `proj:${component}`,
  line,
  message: `Sonar finding in ${component}`,
  severity
})

// The scanner stand-in is a POSIX shell script.
const describePosix = describe.skipIf(process.platform === 'win32')

describePosix('Phase2Server against a SonarQube-like HTTP server', () => {
  it('runs the scanner in the project root, authenticates, and keeps only issues in the selected files', async () => {
    sonar = await startSonar(
      ok([sonarIssue('src/a.ts', 3), sonarIssue('src/other.ts', 9, 'MAJOR'), sonarIssue('src/a.ts', 5, 'MINOR')])
    )

    const result = await new Phase2Server(configFor(sonar.url, writeScanner('pwd > scanner-ran\nexit 0'))).run([
      path.join(dir, 'src', 'a.ts')
    ])

    expect(result.passed).toBe(false)
    expect(result.issues.map(issue => [issue.file, issue.line, issue.severity])).toEqual([
      ['src/a.ts', 3, 'error'],
      ['src/a.ts', 5, 'info']
    ])
    expect(fs.readFileSync(path.join(dir, 'scanner-ran'), 'utf8').trim()).toBe(fs.realpathSync(dir))
    expect(sonar.requests.every(request => request.authorization === 'Bearer secret-token')).toBe(true)
    expect(sonar.requests.map(request => request.path)).toContain('/api/issues/search')
  }, 60_000)

  it('passes when the server has no issues for the selected files', async () => {
    sonar = await startSonar(ok([sonarIssue('src/other.ts', 1)]))

    const result = await new Phase2Server(configFor(sonar.url, writeScanner('exit 0'))).run([
      path.join(dir, 'src', 'a.ts')
    ])

    expect(result).toEqual({ passed: true, issues: [] })
  }, 60_000)

  it('reports a failing scanner with its own output', async () => {
    sonar = await startSonar(ok())

    const result = await new Phase2Server(
      configFor(sonar.url, writeScanner('echo "scanner exploded" >&2\nexit 3'))
    ).run(['src/a.ts'])

    expect(result.passed).toBe(false)
    expect(result.phaseError?.code).toBe('SONAR_API_ERROR')
    expect(result.phaseError?.message).toMatch(/exited with code 3: scanner exploded/)
  }, 60_000)

  it('reports an analysis the server marked as failed', async () => {
    sonar = await startSonar(ok([], 'FAILED'))

    const result = await new Phase2Server(configFor(sonar.url, writeScanner('exit 0'))).run(['src/a.ts'])

    expect(result.passed).toBe(false)
    expect(result.phaseError?.message).toMatch(/analysis failed/)
  }, 60_000)

  it('reports an issues API that answers with an error status', async () => {
    sonar = await startSonar(requestPath =>
      requestPath === '/api/issues/search' ? { status: 500, body: { errors: [{ msg: 'boom' }] } } : ok()(requestPath)
    )

    const result = await new Phase2Server(configFor(sonar.url, writeScanner('exit 0'))).run(['src/a.ts'])

    expect(result.passed).toBe(false)
    expect(result.phaseError?.code).toBe('SONAR_API_ERROR')
  }, 60_000)

  it('reports a server that cannot be reached', async () => {
    sonar = await startSonar(ok())

    const { url } = sonar

    await sonar.close()
    sonar = undefined

    const phase2 = new Phase2Server(configFor(url, writeScanner('exit 0')))

    Reflect.set(phase2, 'sleep', () => Promise.resolve())

    const result = await phase2.run(['src/a.ts'])

    expect(result.passed).toBe(false)
    expect(result.phaseError?.code).toBe('SONAR_CONNECTION_FAILED')
  }, 60_000)

  it('falls back to a fixed wait when the compute-engine API needs admin rights', async () => {
    sonar = await startSonar(requestPath =>
      requestPath === '/api/ce/activity' ? { status: 403, body: {} } : ok([sonarIssue('src/a.ts', 2)])(requestPath)
    )

    const phase2 = new Phase2Server(configFor(sonar.url, writeScanner('exit 0')))

    Reflect.set(phase2, 'sleep', () => Promise.resolve())

    const result = await phase2.run(['src/a.ts'])

    expect(result.issues).toHaveLength(1)
    expect(sonar.requests.map(request => request.path)).toContain('/api/measures/component')
  }, 60_000)

  it('refuses a scanner that is not on the allow list', async () => {
    sonar = await startSonar(ok())

    const result = await new Phase2Server(configFor(sonar.url, '/bin/sh')).run(['src/a.ts'])

    expect(result.passed).toBe(false)
    expect(result.phaseError?.message).toMatch(/Scanner 'sh' is not in the allowed list/)
  })
})

describePosix('QualityGate with Phase 1 and a SonarQube-like server', () => {
  const needsFixes = 'var total = 0\nif (total > 1) {\n  total = 2\n}\nexport { total }\n'

  it('keeps the Phase 1 fixes when Phase 2 reports findings, and reports them for the file as it is now', async () => {
    const workDir = fs.mkdtempSync(path.join(process.cwd(), 'aqg-sonar-gate-'))
    const file = path.join(workDir, 'a.js')

    fs.writeFileSync(file, needsFixes, 'utf8')

    try {
      sonar = await startSonar(ok([sonarIssue(`${path.basename(workDir)}/a.js`, 1)]))

      const response = await runGate(sonar.url, file)
      const onDisk = fs.readFileSync(file, 'utf8')

      expect(response.phase).toBe('server')
      expect(response.success).toBe(false)
      expect(response.attempted).toBeUndefined()
      expect(response.fixedCount).toBeGreaterThan(0)
      expect(onDisk).toContain('let total = 0')
      expect(response.remaining.map(issue => issue.rule)).toEqual(['typescript:S1234'])
      expect(response.message).toMatch(/^Kept \d+ auto-fixes?\. SonarQube found additional issues\./)
    } finally {
      fs.rmSync(workDir, { force: true, recursive: true })
    }
  }, 120_000)

  it('keeps them when the server cannot be analysed at all, and says why', async () => {
    const workDir = fs.mkdtempSync(path.join(process.cwd(), 'aqg-sonar-gate-'))
    const file = path.join(workDir, 'a.js')

    fs.writeFileSync(file, needsFixes, 'utf8')

    try {
      sonar = await startSonar(requestPath =>
        requestPath === '/api/issues/search' ? { status: 500, body: {} } : ok()(requestPath)
      )

      const response = await runGate(sonar.url, file)

      expect(fs.readFileSync(file, 'utf8')).toContain('let total = 0')
      expect(response.phase).toBe('server')
      expect(response.error?.code).toBe('SONAR_API_ERROR')
      expect(response.message).toMatch(/failed due to a server or network error/)
    } finally {
      fs.rmSync(workDir, { force: true, recursive: true })
    }
  }, 120_000)

  it('passes completely when the server has nothing to add', async () => {
    const workDir = fs.mkdtempSync(path.join(process.cwd(), 'aqg-sonar-gate-'))
    const file = path.join(workDir, 'a.js')

    fs.writeFileSync(file, needsFixes, 'utf8')

    try {
      sonar = await startSonar(ok())

      const response = await runGate(sonar.url, file)

      expect(response.success).toBe(true)
      expect(response.phase).toBe('complete')
      expect(fs.readFileSync(file, 'utf8')).toContain('let total = 0')
    } finally {
      fs.rmSync(workDir, { force: true, recursive: true })
    }
  }, 120_000)
})
