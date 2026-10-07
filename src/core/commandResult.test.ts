import { describe, expect, it } from 'vitest'

import { commandFailureMessage, type CommandResult } from '@/core/commandResult'

const result = (overrides: Partial<CommandResult>): CommandResult => ({
  exitCode: 2,
  signal: null,
  stdout: '',
  stderr: '',
  ...overrides
})

describe('commandFailureMessage', () => {
  it.each([
    [{ error: 'spawn failed' }, 'spawn failed'],
    [{ stderr: ' bad input \n' }, 'bad input'],
    [{ stdout: 'only stdout' }, 'only stdout'],
    [{ signal: 'SIGTERM' as const, exitCode: null }, 'Prettier stopped by signal SIGTERM'],
    [{ exitCode: null }, 'Prettier did not exit'],
    [{ exitCode: 2 }, 'Prettier exited with code 2']
  ])('describes %j', (overrides, expected) => {
    expect(commandFailureMessage(result(overrides), 'Prettier')).toBe(expected)
  })
})

describe('commandFailureMessage names the tool it was given', () => {
  it('uses it when the command only has an exit status to report', () => {
    expect(commandFailureMessage(result({ exitCode: 3 }), 'vue-tsc')).toBe('vue-tsc exited with code 3')
  })
})
