/**
 * MCP quality_fix tool logic (shared with tests; no MCP transport).
 */

import path from 'node:path'

import { configManager } from '@/config'
import { QualityGate } from '@/core'
import { FailureTracker, markPersistentFailure } from '@/core/FailureTracker'
import { PathLock } from '@/core/PathLock'
import { matchDiskCase } from '@/utils/diskPath'
import { PHASE } from '@/constants'
import { ERROR_CODE } from '@/constants/errors'
import { failureResponse, noFilesResponse, zeroTiming } from '@/core/responses'
import type { QualityFixResponse } from '@/types'
import { filterCodeFiles } from '@/utils/codeFileFilter'
import { errorMessage } from '@/utils/errorMessage'

export const toToolResponse = (response: QualityFixResponse) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }]
})

export const buildEmptyResponse = (skippedCount: number, skippedList: string): QualityFixResponse =>
  noFilesResponse(`✅ No code files to check. Skipped ${skippedCount} non-code file(s): ${skippedList}`)

export const buildErrorResponse = (message: string): QualityFixResponse =>
  failureResponse({
    phase: PHASE.LOCAL,
    message: 'Configuration or execution error',
    remaining: [],
    timing: zeroTiming(),
    error: { code: ERROR_CODE.CONFIG_INVALID, message }
  })

/** One per server process: the MCP server outlives a single call, which is what makes a repeat visible. */
export const failureTracker = new FailureTracker()

/** One per server process, for the same reason. */
export const pathLock = new PathLock()

export async function runQualityFixForFiles(files: string[]): Promise<QualityFixResponse> {
  try {
    const { codeFiles, skippedFiles } = filterCodeFiles(files)

    if (codeFiles.length === 0) return buildEmptyResponse(skippedFiles.length, skippedFiles.join(', '))

    // Find the first absolute path to use as the starting directory for project root discovery
    // This allows the global MCP server to correctly identify the workspace of the passed files.
    const firstAbsFile = codeFiles.find(f => path.isAbsolute(f))
    const startDir = firstAbsFile ? path.dirname(firstAbsFile) : process.cwd()

    // Reset config so different runs in the same long-lived MCP session can discover new workspaces
    configManager.reset()
    const config = configManager.load(startDir)

    const qualityGate = new QualityGate(config)
    // The MCP server answers calls while others are still running. Overlapping calls would roll each other back.
    const result = await pathLock.run(
      codeFiles.map(file => matchDiskCase(path.resolve(config.projectRoot, file))),
      () => qualityGate.run(codeFiles)
    )

    markPersistentFailure(result, failureTracker.record(codeFiles, config.projectRoot, result))

    if (skippedFiles.length > 0) result.message += ` (Skipped ${skippedFiles.length} non-code file(s))`

    return result
  } catch (error) {
    return buildErrorResponse(errorMessage(error))
  }
}
