/**
 * Outcome of a spawned tool process.
 */

import { EXIT_CODE } from '@/constants/exit-codes'

export interface CommandResult {
  exitCode: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  error?: string
}

export const commandSucceeded = (result: CommandResult): boolean =>
  result.error === undefined && result.signal === null && result.exitCode === EXIT_CODE.SUCCESS

/** @throws Error when the process did not run to a normal exit: it failed to start, was killed, or never exited. */
export const assertCommandCompleted = (result: CommandResult): void => {
  if (result.error !== undefined || result.signal !== null || result.exitCode === null) {
    throw new Error(
      result.error ?? `exit ${String(result.exitCode)}, signal ${String(result.signal)}: ${result.stderr}`
    )
  }
}

/** Why a command failed, in the words of whoever knows: its error, its stderr, its stdout, or how it ended. */
export const commandFailureMessage = (result: CommandResult, tool: string): string => {
  if (result.error !== undefined && result.error.length > 0) return result.error

  const stderr = result.stderr.trim()

  if (stderr.length > 0) return stderr

  const stdout = result.stdout.trim()

  if (stdout.length > 0) return stdout

  if (result.signal !== null) return `${tool} stopped by signal ${result.signal}`

  if (result.exitCode === null) return `${tool} did not exit`

  return `${tool} exited with code ${String(result.exitCode)}`
}
