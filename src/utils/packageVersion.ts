/**
 * Read package version from project root package.json.
 * Resolves correctly when this module lives under `src/**` (tests) or `dist/**` (bundle).
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function getPackageVersion(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [path.join(moduleDir, '..', 'package.json'), path.join(moduleDir, '..', '..', 'package.json')]

  for (const packageJsonPath of candidates) {
    try {
      const raw = fs.readFileSync(packageJsonPath, 'utf8')
      const parsed = JSON.parse(raw) as { version?: string }

      if (typeof parsed.version === 'string') return parsed.version
    } catch {
      // try next candidate
    }
  }

  return '0.0.0'
}
