/**
 * Reading what `prettier --write` did: which files it changed, and what it said when it failed.
 */

import fs from 'node:fs'
import path from 'node:path'

import type { CommandResult } from '@/core/commandResult'

const PRETTIER_ERROR_PREFIX = '[error] '

/** Files whose content differs from the snapshot taken before Prettier ran. Keys are resolved paths. */
export const countChangedFiles = (files: readonly string[], before: ReadonlyMap<string, string>): number => {
  let changed = 0

  for (const file of files) {
    const resolved = path.resolve(file)

    if (fs.readFileSync(resolved, 'utf8') !== before.get(resolved)) changed += 1
  }

  return changed
}

/**
 * Prettier prints `[error] <path relative to its cwd>: <reason>` for each file it cannot format.
 * Without a match the first file stands in.
 */
export const prettierFailureFile = (
  result: CommandResult,
  appDir: string,
  files: readonly string[]
): string | undefined => {
  const reported = result.stderr
    .split('\n')
    .filter(line => line.startsWith(PRETTIER_ERROR_PREFIX))
    .map(line => line.slice(PRETTIER_ERROR_PREFIX.length))

  const failing = files.find(file =>
    [path.relative(appDir, file), file].some(name => reported.some(line => line.startsWith(`${name}:`)))
  )

  return failing ?? files[0]
}
