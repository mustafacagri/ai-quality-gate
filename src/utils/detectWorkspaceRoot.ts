import fs from 'node:fs'
import path from 'node:path'
import { PROJECT_ROOT_MARKER_FILES } from '@/constants/project-root'

/**
 * Detects the workspace root by searching upwards from the start directory up to 10 levels.
 */
export function detectWorkspaceRoot(startDir: string): string {
  // 1. Start from current working directory
  let dir = startDir

  // 2. Search upward for project markers
  const markers = [...PROJECT_ROOT_MARKER_FILES, '.git', 'pnpm-workspace.yaml']

  for (let i = 0; i < 10; i++) {
    // Max 10 levels up
    for (const marker of markers) {
      if (fs.existsSync(path.join(dir, marker))) {
        return dir
      }
    }

    const parent = path.dirname(dir)

    if (parent === dir) break

    dir = parent
  }

  // 3. Fallback: return original
  return startDir
}
