import { describe, expect, it } from 'vitest'

import { Verifier } from '@/core/Verifier'
import { DEFAULT_FIXER_CONFIG, type Config } from '@/types'

const baseConfig = (): Config => ({
  projectRoot: '/tmp/aqg-verifier-test',
  phase1Timeout: 30_000,
  phase2Timeout: 300_000,
  enableI18nRules: false,
  fixers: { ...DEFAULT_FIXER_CONFIG }
})

describe('Verifier', () => {
  it('returns passed when there are no TypeScript files', async () => {
    const verifier = new Verifier(baseConfig())

    const empty = await verifier.runTypeCheck([])
    expect(empty.passed).toBe(true)
    expect(empty.errors).toHaveLength(0)

    const jsOnly = await verifier.runTypeCheck(['lib/a.js'])
    expect(jsOnly.passed).toBe(true)
    expect(jsOnly.errors).toHaveLength(0)
  })

  it('returns passed for lint when there are no lintable files', async () => {
    const verifier = new Verifier(baseConfig())

    const result = await verifier.runLintCheck(['scripts/deploy.sh'])

    expect(result.passed).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('returns success with zero formatted files when nothing is formattable', async () => {
    const verifier = new Verifier(baseConfig())

    const empty = await verifier.runPrettier([])
    expect(empty.success).toBe(true)
    expect(empty.formattedCount).toBe(0)

    const noExt = await verifier.runPrettier(['README'])
    expect(noExt.formattedCount).toBe(0)
  })
})
