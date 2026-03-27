/**
 * Infer project root by walking upward from `startDir` until `package.json` or `tsconfig.json` is found.
 * If the filesystem root is reached without a match, returns `startDir` (resolved).
 */

import fs from 'node:fs'
import path from 'node:path'

import { PROJECT_ROOT_MARKER_FILES } from '@/constants/project-root'

function hasProjectMarker(dir: string): boolean {
  for (const name of PROJECT_ROOT_MARKER_FILES) {
    if (fs.existsSync(path.join(dir, name))) return true
  }

  return false
}

export function findProjectRoot(startDir: string): string {
  let current = path.resolve(startDir)

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- walk to filesystem root
  while (true) {
    if (hasProjectMarker(current)) return current

    const parent = path.dirname(current)

    if (parent === current) break

    current = parent
  }

  return path.resolve(startDir)
}
