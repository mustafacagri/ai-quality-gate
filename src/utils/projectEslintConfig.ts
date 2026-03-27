/**
 * Resolve an ESLint config file in the project root (flat + legacy filenames).
 */

import fs from 'node:fs'
import path from 'node:path'

import { ESLINT_PROJECT_ROOT_CONFIG_FILENAMES } from '@/constants/eslintConfigFilenames'

/**
 * @returns Absolute path to a root-level ESLint config file, if one exists.
 */
export const findProjectEslintConfigFile = (projectRoot: string): string | undefined => {
  const root = path.resolve(projectRoot)

  for (const name of ESLINT_PROJECT_ROOT_CONFIG_FILENAMES) {
    const full = path.join(root, name)

    if (fs.existsSync(full)) return full
  }

  return undefined
}
