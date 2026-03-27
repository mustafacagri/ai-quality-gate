/**
 * MCP quality_fix tool logic (shared with tests; no MCP transport).
 */

import { configManager } from '@/config'
import { QualityGate } from '@/core'
import { PHASE } from '@/constants'
import type { QualityFixResponse } from '@/types'
import { filterCodeFiles } from '@/utils/codeFileFilter'

export const toToolResponse = (response: QualityFixResponse) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }]
})

export const buildEmptyResponse = (skippedCount: number, skippedList: string): QualityFixResponse => ({
  phase: PHASE.COMPLETE,
  success: true,
  message: `✅ No code files to check. Skipped ${skippedCount} non-code file(s): ${skippedList}`,
  fixed: { eslint: 0, curlyBraces: 0, singleLineArrow: 0, prettier: 0, json: 0 },
  remaining: [],
  timing: { phase1: '0ms', total: '0ms' }
})

export const buildErrorResponse = (errorMessage: string): QualityFixResponse => ({
  phase: PHASE.LOCAL,
  success: false,
  message: 'Configuration or execution error',
  fixed: { eslint: 0, curlyBraces: 0, singleLineArrow: 0, prettier: 0, json: 0 },
  remaining: [],
  timing: { phase1: '0ms', total: '0ms' },
  error: { code: 'CONFIG_INVALID', message: errorMessage }
})

export async function runQualityFixForFiles(files: string[]): Promise<QualityFixResponse> {
  try {
    const { codeFiles, skippedFiles } = filterCodeFiles(files)

    if (codeFiles.length === 0) return buildEmptyResponse(skippedFiles.length, skippedFiles.join(', '))

    const config = configManager.load()
    const qualityGate = new QualityGate(config)
    const result = await qualityGate.run(codeFiles)

    if (skippedFiles.length > 0) result.message += ` (Skipped ${skippedFiles.length} non-code file(s))`

    return result
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    return buildErrorResponse(errorMessage)
  }
}
