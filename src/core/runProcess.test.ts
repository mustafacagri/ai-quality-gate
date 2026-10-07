import os from 'node:os'

import { describe, expect, it } from 'vitest'

import { runProcess } from '@/core/runProcess'

const node = process.execPath
const here = os.tmpdir()

describe('runProcess', () => {
  it('collects stdout and stderr and the exit code', async () => {
    const result = await runProcess(
      node,
      ['-e', "process.stdout.write('out'); process.stderr.write('err'); process.exit(3)"],
      { cwd: here, timeout: 30_000 }
    )

    expect(result).toEqual({ exitCode: 3, signal: null, stdout: 'out', stderr: 'err' })
  })

  it('runs in the given directory and adds the given variables to the environment', async () => {
    const result = await runProcess(
      node,
      ['-e', 'process.stdout.write(process.cwd() + "|" + process.env.AQG_TEST_VALUE)'],
      {
        cwd: here,
        timeout: 30_000,
        env: { AQG_TEST_VALUE: 'present' }
      }
    )

    expect(result.stdout.endsWith('|present')).toBe(true)
    expect(result.exitCode).toBe(0)
  })

  it('does not leak the added variables into this process', async () => {
    await runProcess(node, ['-e', ''], { cwd: here, timeout: 30_000, env: { AQG_TEST_VALUE: 'present' } })

    expect(Reflect.get(process.env, 'AQG_TEST_VALUE')).toBeUndefined()
  })

  it('reports a command that cannot start instead of rejecting', async () => {
    const result = await runProcess('/definitely/not/a/command', [], { cwd: here, timeout: 30_000 })

    expect(result.exitCode).toBeNull()
    expect(result.error).toMatch(/ENOENT/)
  })

  it('kills a process that runs past the timeout and says it was a signal', async () => {
    const result = await runProcess(node, ['-e', 'setTimeout(() => {}, 60000)'], { cwd: here, timeout: 200 })

    expect(result.exitCode).toBeNull()
    expect(result.signal).toBe('SIGTERM')
  })

  it('runs through a shell only when asked to', async () => {
    const direct = await runProcess('echo "$((1 + 1))"', [], { cwd: here, timeout: 30_000 })
    const shell = await runProcess('echo "$((1 + 1))"', [], { cwd: here, timeout: 30_000, shell: true })

    expect(direct.error).toBeDefined()
    expect(shell.stdout.trim()).toBe('2')
  })
})
