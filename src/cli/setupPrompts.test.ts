import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { SETUP_FIXER_VALUES } from '@/cli/setupModel'
import {
  assertValidHttpUrl,
  formatValidationError,
  parsePositiveInt,
  promptSetupWizardModel,
  validateFixerKeysSelection,
  validateRequiredField,
  validateSonarHostInput,
  validateTimeoutInput
} from '@/cli/setupPrompts'

const { mockPrompt } = vi.hoisted(() => ({
  mockPrompt: vi.fn()
}))

vi.mock('inquirer', () => ({
  default: {
    prompt: mockPrompt
  }
}))

const makeTempDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-setup-'))

describe('setupPrompts helpers', () => {
  it('assertValidHttpUrl accepts http and https', () => {
    expect(() => assertValidHttpUrl('https://sonar.example.com')).not.toThrow()
    expect(() => assertValidHttpUrl('http://localhost:9000')).not.toThrow()
  })

  it('assertValidHttpUrl rejects non-http protocols', () => {
    expect(() => assertValidHttpUrl('file:///tmp/x')).toThrow()
  })

  it('assertValidHttpUrl rejects malformed input', () => expect(() => assertValidHttpUrl('not a url')).toThrow())

  it('parsePositiveInt parses valid positive integers', () =>
    expect(parsePositiveInt(' 30000 ', 'Phase 1 timeout')).toBe(30_000))

  it('parsePositiveInt rejects non-positive values', () => {
    expect(() => parsePositiveInt('0', 'x')).toThrow()
    expect(() => parsePositiveInt('-1', 'x')).toThrow()
  })

  it('validateTimeoutInput returns true for valid positive integers', () =>
    expect(validateTimeoutInput('30000', 'Phase 1 timeout')).toBe(true))

  it('validateTimeoutInput returns error message for invalid timeout', () =>
    expect(validateTimeoutInput('not-a-number', 'Phase 1 timeout')).toMatch(/positive integer/i))

  it('formatValidationError stringifies non-Error throws', () => {
    expect(formatValidationError(new Error('a'))).toBe('a')
    expect(formatValidationError('plain')).toBe('plain')
    expect(formatValidationError(42)).toBe('42')
  })

  it('validateRequiredField requires non-empty trimmed input', () => {
    expect(validateRequiredField('x', 'empty')).toBe(true)
    expect(validateRequiredField('  ', 'need')).toBe('need')
  })

  it('validateFixerKeysSelection requires a non-empty array', () => {
    expect(validateFixerKeysSelection([SETUP_FIXER_VALUES.ESLINT])).toBe(true)
    expect(validateFixerKeysSelection([])).toBe('Select at least one tool')
    expect(validateFixerKeysSelection(undefined)).toBe('Select at least one tool')
  })

  it('validateSonarHostInput mirrors assertValidHttpUrl failures as strings', () => {
    expect(validateSonarHostInput('https://x.example')).toBe(true)
    expect(validateSonarHostInput('file:///x')).toMatch(/http/)
  })
})

describe('promptSetupWizardModel', () => {
  let tmp: string

  beforeEach(() => {
    tmp = makeTempDir()
    mockPrompt.mockReset()
  })

  afterEach(() => fs.rmSync(tmp, { force: true, recursive: true }))

  it('returns aborted when output file exists and overwrite is declined', async () => {
    const out = path.join(tmp, 'existing.yaml')
    fs.writeFileSync(out, 'x', 'utf8')

    mockPrompt
      .mockResolvedValueOnce({ projectRoot: './', useSonar: false })
      .mockResolvedValueOnce({ fixerKeys: [SETUP_FIXER_VALUES.ESLINT] })
      .mockResolvedValueOnce({
        phase1TimeoutRaw: '30000',
        phase2TimeoutRaw: '300000',
        enableI18nRules: false,
        outputPath: out
      })
      .mockResolvedValueOnce({ overwrite: false })

    const result = await promptSetupWizardModel()

    expect(result).toBe('aborted')
  })

  it('returns a full model when output file is new', async () => {
    const out = path.join(tmp, 'new-config.yaml')

    mockPrompt
      .mockResolvedValueOnce({ projectRoot: './src', useSonar: false })
      .mockResolvedValueOnce({
        fixerKeys: [SETUP_FIXER_VALUES.ESLINT, SETUP_FIXER_VALUES.CURLY_BRACES]
      })
      .mockResolvedValueOnce({
        phase1TimeoutRaw: '30000',
        phase2TimeoutRaw: '300000',
        enableI18nRules: true,
        outputPath: out
      })

    const result = await promptSetupWizardModel()

    expect(result).not.toBe('aborted')

    if (result === 'aborted') throw new Error('unexpected abort')

    expect(result.projectRoot).toBe('./src')
    expect(result.enableI18nRules).toBe(true)
    expect(result.outputPath).toBe(path.resolve(out))
    expect(result.fixers.eslint).toBe(true)
    expect(result.fixers.curlyBraces).toBe(true)
    expect(result.phase1Timeout).toBe(30_000)
  })

  it('includes Sonar fields when Phase 2 is enabled', async () => {
    const out = path.join(tmp, 'with-sonar.yaml')

    mockPrompt
      .mockResolvedValueOnce({ projectRoot: '.', useSonar: true })
      .mockResolvedValueOnce({
        hostUrl: 'https://sonar.example.com',
        projectKey: 'my-key',
        _tokenHint: ''
      })
      .mockResolvedValueOnce({ fixerKeys: [SETUP_FIXER_VALUES.ESLINT] })
      .mockResolvedValueOnce({
        phase1TimeoutRaw: '30000',
        phase2TimeoutRaw: '300000',
        enableI18nRules: false,
        outputPath: out
      })

    const result = await promptSetupWizardModel()

    expect(result).not.toBe('aborted')

    if (result === 'aborted') throw new Error('unexpected abort')

    expect(result.sonar).toEqual({
      hostUrl: 'https://sonar.example.com',
      projectKey: 'my-key'
    })
  })

  it('logs token guidance when a Sonar token hint is entered', async () => {
    const out = path.join(tmp, 'sonar-token.yaml')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    mockPrompt
      .mockResolvedValueOnce({ projectRoot: '.', useSonar: true })
      .mockResolvedValueOnce({
        hostUrl: 'https://sonar.example.com',
        projectKey: 'k',
        _tokenHint: 'secret'
      })
      .mockResolvedValueOnce({ fixerKeys: [SETUP_FIXER_VALUES.ESLINT] })
      .mockResolvedValueOnce({
        phase1TimeoutRaw: '30000',
        phase2TimeoutRaw: '300000',
        enableI18nRules: false,
        outputPath: out
      })

    await promptSetupWizardModel()

    expect(log.mock.calls.some(call => String(call[0]).includes('SONAR_TOKEN'))).toBe(true)

    log.mockRestore()
  })

  it('overwrites an existing file when the user confirms', async () => {
    const out = path.join(tmp, 'overwrite.yaml')
    fs.writeFileSync(out, 'old', 'utf8')

    mockPrompt
      .mockResolvedValueOnce({ projectRoot: './', useSonar: false })
      .mockResolvedValueOnce({ fixerKeys: [SETUP_FIXER_VALUES.ESLINT] })
      .mockResolvedValueOnce({
        phase1TimeoutRaw: '30000',
        phase2TimeoutRaw: '300000',
        enableI18nRules: false,
        outputPath: out
      })
      .mockResolvedValueOnce({ overwrite: true })

    const result = await promptSetupWizardModel()

    expect(result).not.toBe('aborted')

    if (result === 'aborted') throw new Error('unexpected abort')

    expect(result.outputPath).toBe(path.resolve(out))
  })
})
