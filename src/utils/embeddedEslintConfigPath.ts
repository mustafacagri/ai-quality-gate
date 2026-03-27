/**
 * Resolve path to bundled ESLint flat config (copied to dist/eslint by tsup).
 * Uses this module's location so it works when the package is nested under any folder name.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ESLINT_CONFIG_REL = path.join('eslint', 'config.mjs')

/** Parent hops when searching for `eslint/config.mjs` next to dist/ or src/ */
const EMBEDDED_ESLINT_CONFIG_MAX_WALK_DEPTH = 8

const walkUpForEslintConfig = (startDir: string): string | undefined => {
  let current = path.resolve(startDir)

  for (let depth = 0; depth < EMBEDDED_ESLINT_CONFIG_MAX_WALK_DEPTH; depth += 1) {
    const candidate = path.join(current, ESLINT_CONFIG_REL)

    if (fs.existsSync(candidate)) return candidate

    const parent = path.dirname(current)

    if (parent === current) break

    current = parent
  }

  return undefined
}

/**
 * Absolute path to embedded `eslint/config.mjs` shipped with this package.
 */
export const resolveEmbeddedEslintConfigPath = (): string => {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url))
  const found = walkUpForEslintConfig(moduleDir)

  if (found) return found

  return path.resolve(moduleDir, ESLINT_CONFIG_REL)
}
