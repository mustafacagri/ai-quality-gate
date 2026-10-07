/**
 * Read package version from project root package.json.
 * Resolves correctly when this module lives under `src/**` (tests) or `dist/**` (bundle).
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PACKAGE_JSON } from '@/constants/project-root'

export function getPackageVersion(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [path.join(moduleDir, '..', PACKAGE_JSON), path.join(moduleDir, '..', '..', PACKAGE_JSON)]

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
