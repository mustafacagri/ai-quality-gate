/**
 * Paths that name the same file but are spelled differently. On a case-insensitive file system (macOS and Windows
 * by default) `CASE.ts` and `case.ts` are one file, and `tsc` reports it in the case it has on disk.
 */

import fs from 'node:fs'
import path from 'node:path'

/**
 * The path with each part in the case it has on disk. A part that does not exist, or a directory that cannot be
 * read, keeps the case it was given. Symbolic links are not resolved, so the result still starts where the input did.
 */
export const matchDiskCase = (absolutePath: string): string => {
  const resolved = path.resolve(absolutePath)
  const { root } = path.parse(resolved)
  let current = root

  for (const part of resolved.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, matchEntry(current, part))
  }

  return current
}

/** The entry of `directory` that is `name` apart from its case; `name` itself when there is none or it is exact. */
const matchEntry = (directory: string, name: string): string => {
  try {
    const entries = fs.readdirSync(directory)

    if (entries.includes(name)) return name

    return entries.find(entry => entry.toLowerCase() === name.toLowerCase()) ?? name
  } catch {
    return name
  }
}

/**
 * Whether `file` is one of `paths`, however its case is spelled. The exact spelling is tried first, because
 * reading the directories to find the on-disk case costs more and is only needed on a miss.
 */
export const hasPath = (paths: ReadonlySet<string>, file: string): boolean => {
  const resolved = path.resolve(file)

  return paths.has(resolved) || paths.has(matchDiskCase(resolved))
}
