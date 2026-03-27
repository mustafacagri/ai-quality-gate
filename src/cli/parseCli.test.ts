import { describe, expect, it } from 'vitest'

import { CLI_OPTION, parseCliArgs, shouldUseCliMode } from '@/cli/parseCli'

const argv = (...args: string[]): string[] => ['node', 'ai-quality-gate', ...args]

describe('shouldUseCliMode', () => {
  it('is false with no args or only unknown args (MCP mode)', () => {
    expect(shouldUseCliMode(['node', 'server.js'])).toBe(false)
    expect(shouldUseCliMode(['node', 'server.js', '--stdio'])).toBe(false)
    expect(shouldUseCliMode(['node', 'server.js', 'extra-from-host'])).toBe(false)
  })

  it('is true when a known CLI flag is present', () => {
    expect(shouldUseCliMode(argv('--help'))).toBe(true)
    expect(shouldUseCliMode(argv(`--${CLI_OPTION.SETUP}`))).toBe(true)
    expect(shouldUseCliMode(argv('--check', 'a.ts'))).toBe(true)
    expect(shouldUseCliMode(['node', 'server.js', '--config=/x/y.yaml', '--check', 'a.ts'])).toBe(true)
  })
})

describe('parseCliArgs', () => {
  it('parses --check with positionals', () => {
    const r = parseCliArgs(argv('--check', 'a.ts', 'b.ts'))

    expect(r.ok).toBe(true)

    if (!r.ok || r.kind !== 'run') {
      throw new Error('expected run')
    }

    expect(r.payload.qualityGateOptions).toEqual({ phase1Mode: 'check', phases: 'all' })
    expect(r.payload.files).toEqual(['a.ts', 'b.ts'])
  })

  it('parses --phase2-only without --check or --fix', () => {
    const r = parseCliArgs(argv(`--${CLI_OPTION.PHASE2_ONLY}`, 'x.ts'))

    expect(r.ok).toBe(true)

    if (!r.ok || r.kind !== 'run') {
      throw new Error('expected run')
    }

    expect(r.payload.qualityGateOptions).toEqual({ phases: 'phase2' })
  })

  it('rejects --check and --fix together', () => {
    const r = parseCliArgs(argv('--check', '--fix', 'a.ts'))

    expect(r.ok).toBe(false)

    if (r.ok) {
      throw new Error('expected error')
    }

    expect(r.error).toContain('Invalid flags')
  })

  it('returns help before requiring files', () => {
    const r = parseCliArgs(argv('--help'))

    expect(r.ok).toBe(true)

    if (!r.ok || r.kind !== 'help') {
      throw new Error('expected help')
    }
  })

  it('parses --setup without file paths', () => {
    const r = parseCliArgs(argv(`--${CLI_OPTION.SETUP}`))

    expect(r.ok).toBe(true)

    if (!r.ok || r.kind !== 'setup') {
      throw new Error('expected setup')
    }
  })

  it('rejects --setup with file paths', () => {
    const r = parseCliArgs(argv(`--${CLI_OPTION.SETUP}`, 'a.ts'))

    expect(r.ok).toBe(false)

    if (r.ok) {
      throw new Error('expected error')
    }

    expect(r.error).toContain('setup')
  })
})
