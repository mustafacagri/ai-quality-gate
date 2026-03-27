import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { findProjectEslintConfigFile } from '@/utils/projectEslintConfig'

describe('findProjectEslintConfigFile', () => {
  it('returns absolute path when eslint.config.mjs exists at project root', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-eslint-'))

    try {
      const configPath = path.join(dir, 'eslint.config.mjs')
      fs.writeFileSync(configPath, 'export default []')

      expect(findProjectEslintConfigFile(dir)).toBe(configPath)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns .eslintrc.json path when flat config is absent', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-eslint-'))

    try {
      const legacyPath = path.join(dir, '.eslintrc.json')
      fs.writeFileSync(legacyPath, '{}')

      expect(findProjectEslintConfigFile(dir)).toBe(legacyPath)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns undefined when no known config file exists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-eslint-empty-'))

    try {
      expect(findProjectEslintConfigFile(dir)).toBeUndefined()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
