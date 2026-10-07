/**
 * Where a tool's entry point is. Tools run through Node directly, including on Windows, and the selected source
 * paths are never interpolated into a shell.
 */

import { createRequire } from 'node:module'
import path from 'node:path'

import { PACKAGE_JSON } from '@/constants/project-root'
import { VERIFIER_TOOL_MODULE } from '@/constants/verification'

const packageRequire = createRequire(import.meta.url)

export type ToolModule = (typeof VERIFIER_TOOL_MODULE)[keyof typeof VERIFIER_TOOL_MODULE]

/** The project's own copy of the tool when it has one, otherwise the one that ships with this package. */
export const findToolCommand = (projectDir: string, tool: ToolModule): { command: string; args: string[] } => {
  const projectRequire = createRequire(path.join(projectDir, PACKAGE_JSON))
  let packagePath: string

  try {
    packagePath =
      tool === VERIFIER_TOOL_MODULE.ESLINT ? packageRequire.resolve(tool.package) : projectRequire.resolve(tool.package)
  } catch {
    packagePath = packageRequire.resolve(tool.package)
  }

  return { command: process.execPath, args: [path.join(path.dirname(packagePath), tool.binary)] }
}
