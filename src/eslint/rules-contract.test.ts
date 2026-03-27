import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/** Rules enforced via embedded ESLint (v2.1.0); fixes come from ESLint --fix only. */
const V21_CORE_RULES = ['eqeqeq', 'no-var', 'prefer-const'] as const

describe('rules.json eslintStrict (v2.1.0 core fixable)', () => {
  it('includes no-var, eqeqeq, prefer-const as errors', () => {
    const rulesPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'rules.json')
    const raw = fs.readFileSync(rulesPath, 'utf8')
    const parsed = JSON.parse(raw) as {
      eslintStrict: Record<string, unknown>
    }

    const strict = parsed.eslintStrict

    for (const rule of V21_CORE_RULES) {
      expect(strict).toHaveProperty(rule)
      const value = strict[rule]

      expect(value === 'error' || (Array.isArray(value) && value[0] === 'error')).toBe(true)
    }
  })
})
