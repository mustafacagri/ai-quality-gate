/**
 * CLI entry: config, QualityGate, stdout JSON, exit codes
 */

import path from 'node:path'

import { configManager } from '@/config'
import { ENV_KEYS } from '@/config/schema'
import { QualityGate } from '@/core'
import { EXIT_CODE, PHASE } from '@/constants'
import type { QualityFixResponse } from '@/types'
import { filterCodeFiles } from '@/utils/codeFileFilter'
import { getPackageVersion } from '@/utils/packageVersion'

import { CLI_OPTION, parseCliArgs, type CliRunPayload } from './parseCli'
import { runSetup } from './setup'

function printHelp(): void {
  const lines = [
    'Usage: ai-quality-gate [options] <file ...>',
    '',
    'Options:',
    `  --${CLI_OPTION.CHECK}              Read-only: typecheck + lint (no auto-fix)`,
    `  --${CLI_OPTION.FIX}                Apply fixes (ESLint --fix, Prettier, AST)`,
    `  --${CLI_OPTION.PHASE1_ONLY}        Run Phase 1 only`,
    `  --${CLI_OPTION.PHASE2_ONLY}        Run Phase 2 (SonarQube) only`,
    `  --${CLI_OPTION.CONFIG} <path>      Path to .quality-gate.yaml / .quality-gate.json`,
    `  --${CLI_OPTION.SETUP}             Interactive wizard to create .quality-gate.yaml`,
    `  -h, --${CLI_OPTION.HELP}          Show help`,
    `  --${CLI_OPTION.VERSION}           Print version`,
    '',
    'Exit codes:',
    `  ${String(EXIT_CODE.SUCCESS)}  Success`,
    `  ${String(EXIT_CODE.QUALITY_FAILED)}  Quality checks failed`,
    `  ${String(EXIT_CODE.ERROR)}  Configuration or runtime error`,
    ''
  ]
  console.log(lines.join('\n'))
}

function printVersion(): void {
  console.log(getPackageVersion())
}

function mapExitCode(result: QualityFixResponse): number {
  if (result.error !== undefined) return EXIT_CODE.ERROR

  if (!result.success) return EXIT_CODE.QUALITY_FAILED

  return EXIT_CODE.SUCCESS
}

function buildEmptyCliResponse(skippedCount: number, skippedList: string): QualityFixResponse {
  return {
    phase: PHASE.COMPLETE,
    success: true,
    message: `No code files to check. Skipped ${String(skippedCount)} non-code file(s): ${skippedList}`,
    fixed: { eslint: 0, curlyBraces: 0, singleLineArrow: 0, prettier: 0, json: 0 },
    remaining: [],
    timing: { phase1: '0ms', total: '0ms' }
  }
}

function buildExecutionErrorResponse(message: string): QualityFixResponse {
  return {
    phase: PHASE.LOCAL,
    success: false,
    message: 'Execution error',
    fixed: { eslint: 0, curlyBraces: 0, singleLineArrow: 0, prettier: 0, json: 0 },
    remaining: [],
    timing: { phase1: '0ms', total: '0ms' },
    error: { code: 'UNEXPECTED_ERROR', message }
  }
}

async function runQualityPayload(payload: CliRunPayload): Promise<number> {
  if (payload.configPath !== undefined) process.env[ENV_KEYS.QUALITY_GATE_CONFIG] = path.resolve(payload.configPath)

  const config = configManager.load()
  const { codeFiles, skippedFiles } = filterCodeFiles(payload.files)

  if (codeFiles.length === 0) {
    const empty = buildEmptyCliResponse(skippedFiles.length, skippedFiles.join(', '))

    console.log(JSON.stringify(empty, null, 2))

    return mapExitCode(empty)
  }

  const qualityGate = new QualityGate(config)
  const result = await qualityGate.run(codeFiles, payload.qualityGateOptions)

  if (skippedFiles.length > 0) result.message += ` (Skipped ${String(skippedFiles.length)} non-code file(s))`

  console.log(JSON.stringify(result, null, 2))

  return mapExitCode(result)
}

export async function runCli(argv: string[]): Promise<number> {
  const parsed = parseCliArgs(argv)

  if (!parsed.ok) {
    console.error(parsed.error)

    return EXIT_CODE.ERROR
  }

  if (parsed.kind === 'help') {
    printHelp()

    return EXIT_CODE.SUCCESS
  }

  if (parsed.kind === 'version') {
    printVersion()

    return EXIT_CODE.SUCCESS
  }

  if (parsed.kind === 'setup') return runSetup()

  try {
    return await runQualityPayload(parsed.payload)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const response = buildExecutionErrorResponse(message)

    console.log(JSON.stringify(response, null, 2))

    return EXIT_CODE.ERROR
  }
}
