import fs from 'node:fs'

import { describe, expect, it } from 'vitest'

import { resolveEmbeddedEslintConfigPath } from '@/utils/embeddedEslintConfigPath'

describe('resolveEmbeddedEslintConfigPath', () => {
  it('returns path to an existing eslint config in this package', () => {
    const resolved = resolveEmbeddedEslintConfigPath()

    expect(fs.existsSync(resolved)).toBe(true)
    expect(resolved.endsWith('eslint/config.mjs')).toBe(true)
  })
})
