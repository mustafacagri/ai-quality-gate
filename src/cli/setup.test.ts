import fs from 'node:fs'

import { describe, expect, it, vi, beforeEach } from 'vitest'

import { runSetup } from '@/cli/setup'
import { buildQualityGateYamlFromModel, type SetupWizardModel } from '@/cli/setupModel'
import { EXIT_CODE } from '@/constants'
import { DEFAULT_FIXER_CONFIG } from '@/types'

const mockPrompt = vi.fn()

vi.mock('@/cli/setupPrompts', () => ({
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- inquirer stand-in
  promptSetupWizardModel: () => mockPrompt()
}))

describe('buildQualityGateYamlFromModel', () => {
  it('serializes minimal config without Sonar', () => {
    const model: SetupWizardModel = {
      enableI18nRules: false,
      fixers: { ...DEFAULT_FIXER_CONFIG },
      outputPath: '/tmp/.quality-gate.yaml',
      phase1Timeout: 30_000,
      phase2Timeout: 300_000,
      projectRoot: './'
    }

    const yaml = buildQualityGateYamlFromModel(model)

    expect(yaml).toContain('projectRoot:')
    expect(yaml).toContain('fixers:')
    expect(yaml).toContain('eslint: true')
    expect(yaml).toContain('phase1Timeout: 30000')
    expect(yaml).not.toContain('sonar:')
  })

  it('includes sonar block when provided', () => {
    const model: SetupWizardModel = {
      enableI18nRules: false,
      fixers: { ...DEFAULT_FIXER_CONFIG, eslint: false },
      outputPath: '/tmp/.quality-gate.yaml',
      phase1Timeout: 10_000,
      phase2Timeout: 60_000,
      projectRoot: './src',
      sonar: {
        hostUrl: 'https://sonar.example.com',
        projectKey: 'my-app'
      }
    }

    const yaml = buildQualityGateYamlFromModel(model)

    expect(yaml).toContain('sonar:')
    expect(yaml).toContain('https://sonar.example.com')
    expect(yaml).toContain('my-app')
    expect(yaml).toContain('eslint: false')
  })
})

const baseModel = (): SetupWizardModel => ({
  enableI18nRules: false,
  fixers: { ...DEFAULT_FIXER_CONFIG },
  outputPath: '/tmp/.quality-gate-test.yaml',
  phase1Timeout: 30_000,
  phase2Timeout: 300_000,
  projectRoot: './'
})

describe('runSetup', () => {
  beforeEach(() => {
    mockPrompt.mockReset()
  })

  it('writes YAML and returns success when the wizard completes', async () => {
    mockPrompt.mockResolvedValue(baseModel())

    const write = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    const code = await runSetup()

    expect(code).toBe(EXIT_CODE.SUCCESS)
    expect(write).toHaveBeenCalledWith('/tmp/.quality-gate-test.yaml', expect.stringContaining('projectRoot'), 'utf8')

    write.mockRestore()
    log.mockRestore()
  })

  it('returns error when the wizard is aborted', async () => {
    mockPrompt.mockResolvedValue('aborted')

    const out = vi.spyOn(console, 'log').mockImplementation(() => {})

    const code = await runSetup()

    expect(code).toBe(EXIT_CODE.ERROR)

    out.mockRestore()
  })

  it('returns error when writing fails', async () => {
    mockPrompt.mockResolvedValue(baseModel())

    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('disk full')
    })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})

    const code = await runSetup()

    expect(code).toBe(EXIT_CODE.ERROR)
    expect(err).toHaveBeenCalled()

    vi.restoreAllMocks()
  })
})
