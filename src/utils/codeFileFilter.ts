/**
 * Filter paths to supported code extensions (shared by MCP server and CLI).
 */

import path from 'node:path'

import { SUPPORTED_CODE_EXTENSIONS } from '@/constants'

export interface CodeFileFilterResult {
  codeFiles: string[]
  skippedFiles: string[]
}

export function filterCodeFiles(files: string[]): CodeFileFilterResult {
  const codeFiles: string[] = []
  const skippedFiles: string[] = []

  for (const file of files) {
    const ext = path.extname(file).toLowerCase()

    if (SUPPORTED_CODE_EXTENSIONS.has(ext)) codeFiles.push(file)
    else skippedFiles.push(file)
  }

  return { codeFiles, skippedFiles }
}
