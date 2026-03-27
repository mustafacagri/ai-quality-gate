import { EventEmitter } from 'node:events'

import { describe, expect, it, vi, beforeEach } from 'vitest'

const axiosGet = vi.hoisted(() => vi.fn())
const spawnMock = vi.hoisted(() => vi.fn())

vi.mock('axios', () => ({
  default: {
    get: axiosGet
  }
}))

vi.mock('node:child_process', () => ({
  spawn: spawnMock
}))

import { Phase2Server } from '@/phases/Phase2Server'
import { DEFAULT_FIXER_CONFIG, type Config } from '@/types'

const baseConfig = (): Config => ({
  projectRoot: '/tmp/aqg-phase2',
  phase1Timeout: 30_000,
  phase2Timeout: 300_000,
  enableI18nRules: false,
  fixers: { ...DEFAULT_FIXER_CONFIG },
  sonarHostUrl: 'https://sonar.example.com',
  sonarToken: 'test-token',
  sonarProjectKey: 'key'
})

beforeEach(() => {
  vi.clearAllMocks()

  spawnMock.mockImplementation(() => {
    const proc = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter }

    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    queueMicrotask(() => proc.emit('close', 0))

    return proc
  })

  axiosGet.mockImplementation((url: string) => {
    if (url.includes('/api/issues/search')) return Promise.reject(new Error('ECONNREFUSED'))

    if (url.includes('/api/ce/activity')) {
      return Promise.resolve({
        status: 200,
        data: { tasks: [{ status: 'SUCCESS' }] }
      })
    }

    if (url.includes('/api/measures/component')) return Promise.resolve({ status: 200, data: {} })

    return Promise.resolve({ status: 200, data: {} })
  })
})

describe('Phase2Server', () => {
  it('returns failed when issues API rejects after scanner and wait', async () => {
    const phase2 = new Phase2Server(baseConfig())
    const result = await phase2.run(['src/app.ts'])

    expect(result.passed).toBe(false)
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]?.message).toMatch(/SonarQube analysis failed/)
    expect(result.issues[0]?.message).toMatch(/issues API failed|ECONNREFUSED/)
    expect(result.phaseError?.code).toBe('SONAR_CONNECTION_FAILED')
    expect(result.phaseError?.message).toMatch(/issues API failed|ECONNREFUSED/)
  })
})
