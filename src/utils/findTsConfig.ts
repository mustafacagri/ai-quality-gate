/**
 * Find nearest tsconfig.json for a file
 * Supports monorepo with multiple tsconfig files
 */

import fs from 'node:fs'
import path from 'node:path'

/**
 * Normalize path for cross-platform comparison
 * Handles Windows case-insensitivity and separator differences
 */
const normalizePath = (p: string): string => {
  const normalized = path.normalize(p)

  // Windows paths are case-insensitive
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

/**
 * Check if childPath is under parentPath
 * Cross-platform compatible
 */
const isPathUnder = (childPath: string, parentPath: string): boolean => {
  const normalizedChild = normalizePath(childPath)
  const normalizedParent = normalizePath(parentPath)

  // Ensure parent path ends with separator for accurate comparison
  const parentWithSep = normalizedParent.endsWith(path.sep) ? normalizedParent : `${normalizedParent}${path.sep}`

  return normalizedChild.startsWith(parentWithSep) || normalizedChild === normalizedParent
}

/**
 * Find the nearest tsconfig.json for a given file path
 * Walks up the directory tree until projectRoot
 *
 * @param filePath - The file to find tsconfig for
 * @param projectRoot - The project root boundary
 * @returns Path to nearest tsconfig.json
 * @throws Error if no tsconfig.json found
 */
export const findTsConfig = (filePath: string, projectRoot: string): string => {
  const absoluteFile = path.resolve(filePath)
  const absoluteRoot = path.resolve(projectRoot)

  let currentDir = path.dirname(absoluteFile)

  while (isPathUnder(currentDir, absoluteRoot)) {
    const tsConfigPath = path.join(currentDir, 'tsconfig.json')

    if (fs.existsSync(tsConfigPath)) return tsConfigPath

    const parentDir = path.dirname(currentDir)

    // Reached filesystem root
    if (parentDir === currentDir) break

    currentDir = parentDir
  }

  // Fallback: check project root for tsconfig.json
  const rootTsConfig = path.join(absoluteRoot, 'tsconfig.json')

  if (fs.existsSync(rootTsConfig)) return rootTsConfig

  throw new Error(`tsconfig.json not found for ${filePath}`)
}

/**
 * Group files by their nearest tsconfig.json
 * Useful for running typecheck per tsconfig
 *
 * @param files - Array of file paths
 * @param projectRoot - The project root boundary
 * @returns Map of tsconfig path to files
 */
export const groupFilesByTsConfig = (files: string[], projectRoot: string): Map<string, string[]> => {
  const groups = new Map<string, string[]>()

  for (const file of files) {
    try {
      const tsConfig = findTsConfig(file, projectRoot)
      const existing = groups.get(tsConfig) ?? []
      existing.push(file)
      groups.set(tsConfig, existing)
    } catch {
      // File has no tsconfig - use special marker
      const noTsConfig = '__no_tsconfig__'
      const existing = groups.get(noTsConfig) ?? []
      existing.push(file)
      groups.set(noTsConfig, existing)
    }
  }

  return groups
}
