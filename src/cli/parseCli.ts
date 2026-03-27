/**
 * CLI argument parsing (Node util.parseArgs)
 */

import { parseArgs } from 'node:util'

import type { QualityGateRunOptions } from '@/types'

/** Long option names (single source for parseArgs and help text) */
export const CLI_OPTION = {
  CHECK: 'check',
  FIX: 'fix',
  PHASE1_ONLY: 'phase1-only',
  PHASE2_ONLY: 'phase2-only',
  CONFIG: 'config',
  HELP: 'help',
  SETUP: 'setup',
  VERSION: 'version'
} as const

export interface CliRunPayload {
  qualityGateOptions: QualityGateRunOptions
  configPath: string | undefined
  files: string[]
}

export type ParseCliResult =
  | { error: string; ok: false }
  | { kind: 'help'; ok: true }
  | { kind: 'run'; ok: true; payload: CliRunPayload }
  | { kind: 'setup'; ok: true }
  | { kind: 'version'; ok: true }

/** Flags that select CLI mode (vs MCP stdio server). Unknown argv tokens do not trigger CLI — hosts may pass extra args. */
const CLI_ENTRY_FLAGS: ReadonlySet<string> = new Set([
  '-h',
  `--${CLI_OPTION.HELP}`,
  `--${CLI_OPTION.VERSION}`,
  `--${CLI_OPTION.SETUP}`,
  `--${CLI_OPTION.CHECK}`,
  `--${CLI_OPTION.FIX}`,
  `--${CLI_OPTION.PHASE1_ONLY}`,
  `--${CLI_OPTION.PHASE2_ONLY}`,
  `--${CLI_OPTION.CONFIG}`
])

/**
 * Returns true when the process should run `runCli` and exit, instead of starting the MCP server.
 * Only explicit CLI options count; stray arguments from MCP hosts must not disable MCP.
 */
export function shouldUseCliMode(argv: string[]): boolean {
  for (const arg of argv.slice(2)) {
    if (CLI_ENTRY_FLAGS.has(arg)) return true

    if (arg.startsWith('--config=')) return true
  }

  return false
}

type CliParsedValues = Record<string, boolean | string | undefined>

function buildQualityGateOptions(values: {
  check: boolean
  fix: boolean
  phase1Only: boolean
  phase2Only: boolean
}): QualityGateRunOptions | null {
  const { check, fix, phase1Only, phase2Only } = values

  if (phase1Only && phase2Only) return null

  if (phase2Only) {
    return { phases: 'phase2' }
  }

  if (check && fix) return null

  if (!check && !fix) return null

  const phase1Mode = check ? 'check' : 'fix'

  if (phase1Only) {
    return { phase1Mode, phases: 'phase1' }
  }

  return { phase1Mode, phases: 'all' }
}

interface ReadCliParseArgsResult {
  positionals: string[]
  values: CliParsedValues
}

function readCliParseArgs(args: string[]): ReadCliParseArgsResult {
  const { positionals, values } = parseArgs({
    args,
    options: {
      [CLI_OPTION.CHECK]: { type: 'boolean' },
      [CLI_OPTION.FIX]: { type: 'boolean' },
      [CLI_OPTION.PHASE1_ONLY]: { type: 'boolean' },
      [CLI_OPTION.PHASE2_ONLY]: { type: 'boolean' },
      [CLI_OPTION.CONFIG]: { type: 'string' },
      [CLI_OPTION.HELP]: { type: 'boolean', short: 'h' },
      [CLI_OPTION.SETUP]: { type: 'boolean' },
      [CLI_OPTION.VERSION]: { type: 'boolean' }
    },
    allowPositionals: true,
    strict: true
  })

  return { positionals, values: values as CliParsedValues }
}

function parseCliRunOrError(values: CliParsedValues, positionals: string[]): ParseCliResult {
  const configRaw = values[CLI_OPTION.CONFIG]
  const configPath = typeof configRaw === 'string' && configRaw.length > 0 ? configRaw : undefined

  const gateOpts = buildQualityGateOptions({
    check: values[CLI_OPTION.CHECK] === true,
    fix: values[CLI_OPTION.FIX] === true,
    phase1Only: values[CLI_OPTION.PHASE1_ONLY] === true,
    phase2Only: values[CLI_OPTION.PHASE2_ONLY] === true
  })

  if (gateOpts === null) {
    return {
      error:
        'Invalid flags: use --check or --fix when Phase 1 runs; do not combine --check with --fix; do not combine --phase1-only with --phase2-only.',
      ok: false
    }
  }

  if (positionals.length === 0) {
    return { error: 'Specify at least one file path.', ok: false }
  }

  return {
    kind: 'run',
    ok: true,
    payload: {
      configPath,
      files: positionals,
      qualityGateOptions: gateOpts
    }
  }
}

function parseSetupCliResult(values: CliParsedValues, positionals: string[]): ParseCliResult | null {
  if (values[CLI_OPTION.SETUP] !== true) return null

  const conflicting =
    values[CLI_OPTION.CHECK] === true ||
    values[CLI_OPTION.FIX] === true ||
    values[CLI_OPTION.PHASE1_ONLY] === true ||
    values[CLI_OPTION.PHASE2_ONLY] === true

  if (conflicting) {
    return {
      error: 'Do not combine --setup with --check, --fix, --phase1-only, or --phase2-only.',
      ok: false
    }
  }

  if (positionals.length > 0) {
    return { error: 'Do not pass file paths with --setup.', ok: false }
  }

  return { kind: 'setup', ok: true }
}

export function parseCliArgs(argv: string[]): ParseCliResult {
  const args = argv.slice(2)

  if (args.length === 0) {
    return { error: 'CLI parser invoked with no arguments.', ok: false }
  }

  let parsed: ReadCliParseArgsResult

  try {
    parsed = readCliParseArgs(args)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    return { error: message, ok: false }
  }

  const { positionals, values } = parsed

  if (values[CLI_OPTION.HELP] === true) {
    return { kind: 'help', ok: true }
  }

  if (values[CLI_OPTION.VERSION] === true) {
    return { kind: 'version', ok: true }
  }

  const setupResult = parseSetupCliResult(values, positionals)

  if (setupResult !== null) return setupResult

  return parseCliRunOrError(values, positionals)
}
