/**
 * Shared SonarJS Rules (ESM)
 * DRY - Reads from rules.json
 *
 * NOTE: This file is kept for backwards compatibility.
 * Main config now uses sonarjs.configs.recommended directly.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rulesPath = join(__dirname, 'rules.json')
const rulesData = JSON.parse(readFileSync(rulesPath, 'utf8'))

// Build sonarjs overrides with prefix (on top of recommended)
const sonarjsRules = {}
if (rulesData.sonarjsOverrides)
  for (const [rule, value] of Object.entries(rulesData.sonarjsOverrides)) {
    // Skip _comment fields
    if (!rule.startsWith('_')) sonarjsRules[`sonarjs/${rule}`] = value
  }

// Add eslint strict rules (always error)
const eslintRules = rulesData.eslintStrict || {}

export { sonarjsRules, eslintRules }
