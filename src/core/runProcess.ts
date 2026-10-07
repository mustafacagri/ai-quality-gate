/**
 * Runs a child process and collects what it said, however it ended. Shared by the tool runs of `Verifier` and the
 * scanner run of Phase 2, so both read the output and the end of the process the same way.
 */

import { spawn } from 'node:child_process'

import type { CommandResult } from '@/core/commandResult'

interface RunProcessOptions {
  readonly cwd: string
  /** Milliseconds after which the process is killed. */
  readonly timeout: number
  /** Added to the environment of this process. */
  readonly env?: Record<string, string>
  readonly shell?: boolean
}

/** Never rejects: a process that could not start comes back with `error` set. */
export const runProcess = (command: string, args: string[], options: RunProcessOptions): Promise<CommandResult> =>
  new Promise(resolve => {
    const proc = spawn(command, args, {
      cwd: options.cwd,
      shell: options.shell ?? false,
      timeout: options.timeout,
      env: { ...process.env, ...options.env }
    })
    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => (stdout += data.toString()))
    proc.stderr.on('data', (data: Buffer) => (stderr += data.toString()))
    proc.on('close', (exitCode, signal) => resolve({ exitCode, signal, stdout, stderr }))
    proc.on('error', error => resolve({ exitCode: null, signal: null, stdout, stderr, error: error.message }))
  })
