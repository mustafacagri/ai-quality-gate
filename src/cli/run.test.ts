import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { runCli } from '@/cli/run'
import { configManager } from '@/config'
import { ENV_KEYS } from '@/config/schema'

describe('runCli', () => {
  it('prints help and exits success', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    const code = await runCli(['node', 'ai-quality-gate', '--help'])

    expect(code).toBe(0)
    expect(log.mock.calls.some(call => String(call[0]).includes('Usage:'))).toBe(true)

    log.mockRestore()
  })

  it('prints version and exits success', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    const code = await runCli(['node', 'ai-quality-gate', '--version'])

    expect(code).toBe(0)
    expect(log).toHaveBeenCalled()

    log.mockRestore()
  })

  it('returns error when parse fails', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})

    const code = await runCli(['node', 'ai-quality-gate', '--not-a-real-flag'])

    expect(code).toBe(2)
    expect(err).toHaveBeenCalled()

    err.mockRestore()
  })

  it('prints success JSON when paths are only non-code files', async () => {
    const envSnapshot = { ...process.env }
    configManager.reset()
    process.env[ENV_KEYS.PROJECT_ROOT] = process.cwd()

    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      const readme = path.join(process.cwd(), 'README.md')
      const code = await runCli(['node', 'ai-quality-gate', '--check', readme])

      expect(code).toBe(0)
      expect(log).toHaveBeenCalled()

      const payload = JSON.parse(String(log.mock.calls[0]?.[0])) as { success: boolean; message: string }

      expect(payload.success).toBe(true)
      expect(payload.message).toMatch(/No code files/)
    } finally {
      process.env = envSnapshot
      configManager.reset()
      log.mockRestore()
    }
  })

  it('runs --check on a clean file', async () => {
    const envSnapshot = { ...process.env }
    configManager.reset()
    process.env[ENV_KEYS.PROJECT_ROOT] = process.cwd()

    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    try {
      const file = path.join(process.cwd(), 'src/utils/codeFileFilter.ts')
      const code = await runCli(['node', 'ai-quality-gate', '--check', file])

      expect(code).toBe(0)
      expect(log).toHaveBeenCalled()
    } finally {
      process.env = envSnapshot
      configManager.reset()
      log.mockRestore()
    }
  }, 120_000)
})
