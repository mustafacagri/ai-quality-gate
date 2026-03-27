/**
 * Inquirer prompts for `ai-quality-gate-setup` (typed answers).
 */

import fs from 'node:fs'
import path from 'node:path'

import inquirer from 'inquirer'

import { CONFIG_DEFAULTS } from '@/config/schema'
import { CONFIG_FILE_NAMES } from '@/constants/config-files'
import type { FixerConfig } from '@/types'

import { SETUP_FIXER_VALUES, fixersFromSelection, type SetupWizardModel } from './setupModel'

export function assertValidHttpUrl(value: string): void {
  let parsed: URL

  try {
    parsed = new URL(value.trim())
  } catch {
    throw new TypeError(`Invalid URL: ${value}`)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new TypeError('URL must use http: or https:')
}

/** Maps thrown values to inquirer validation error strings (shared branches). */
export function formatValidationError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function validateRequiredField(input: string, emptyMessage: string): string | true {
  return input.trim().length > 0 ? true : emptyMessage
}

export function validateFixerKeysSelection(selected: unknown): string | true {
  return Array.isArray(selected) && selected.length > 0 ? true : 'Select at least one tool'
}

export function validateSonarHostInput(input: string): string | true {
  try {
    assertValidHttpUrl(input)

    return true
  } catch (error) {
    return formatValidationError(error)
  }
}

interface Step1Answers {
  projectRoot: string
  useSonar: boolean
}

interface SonarAnswers {
  _tokenHint?: string
  hostUrl: string
  projectKey: string
}

interface Step2Answers {
  enableI18nRules: boolean
  fixerKeys: string[]
  outputPath: string
  phase1TimeoutRaw: string
  phase2TimeoutRaw: string
}

export function parsePositiveInt(raw: string, label: string): number {
  const n = Number.parseInt(raw.trim(), 10)

  if (!Number.isFinite(n) || n <= 0) throw new TypeError(`${label} must be a positive integer`)

  return n
}

async function promptSonarBlock(): Promise<SetupWizardModel['sonar'] | undefined> {
  const sonarAnswers = await inquirer.prompt<SonarAnswers>([
    {
      message: 'SonarQube host URL',
      name: 'hostUrl',
      type: 'input',
      validate: (input: string) => validateSonarHostInput(input)
    },
    {
      message: 'SonarQube project key',
      name: 'projectKey',
      type: 'input',
      validate: (input: string) => validateRequiredField(input, 'Project key is required')
    },
    {
      message: 'SonarQube token (not saved to file). Optional — set SONAR_TOKEN in env; press Enter to skip',
      name: '_tokenHint',
      type: 'password'
    }
  ])

  const tokenHint = sonarAnswers._tokenHint ?? ''

  if (tokenHint.length > 0) console.log('\nToken not written to disk. Example:\n  export SONAR_TOKEN="<your-token>"\n')

  return {
    hostUrl: sonarAnswers.hostUrl.trim(),
    projectKey: sonarAnswers.projectKey.trim()
  }
}

export function validateTimeoutInput(input: string, label: string): string | true {
  try {
    parsePositiveInt(input, label)

    return true
  } catch (error) {
    return formatValidationError(error)
  }
}

function promptFixerCheckbox(): Promise<Pick<Step2Answers, 'fixerKeys'>> {
  return inquirer.prompt<Pick<Step2Answers, 'fixerKeys'>>([
    {
      choices: [
        { checked: true, name: 'ESLint (auto-fix)', value: SETUP_FIXER_VALUES.ESLINT },
        { checked: true, name: 'Curly braces (AST)', value: SETUP_FIXER_VALUES.CURLY_BRACES },
        { checked: true, name: 'Single-line arrow (AST)', value: SETUP_FIXER_VALUES.SINGLE_LINE_ARROW },
        { checked: true, name: 'Prettier', value: SETUP_FIXER_VALUES.PRETTIER },
        { checked: true, name: 'JSON validator', value: SETUP_FIXER_VALUES.JSON_VALIDATOR }
      ],
      message: 'Which Phase 1 tools should run?',
      name: 'fixerKeys',
      type: 'checkbox',
      validate: (selected: unknown) => validateFixerKeysSelection(selected)
    }
  ])
}

function promptTimeoutsI18nOutput(): Promise<Omit<Step2Answers, 'fixerKeys'>> {
  return inquirer.prompt<Omit<Step2Answers, 'fixerKeys'>>([
    {
      default: String(CONFIG_DEFAULTS.PHASE1_TIMEOUT),
      message: 'Phase 1 timeout (ms)',
      name: 'phase1TimeoutRaw',
      type: 'input',
      validate: (input: string) => validateTimeoutInput(input, 'Phase 1 timeout')
    },
    {
      default: String(CONFIG_DEFAULTS.PHASE2_TIMEOUT),
      message: 'Phase 2 timeout (ms)',
      name: 'phase2TimeoutRaw',
      type: 'input',
      validate: (input: string) => validateTimeoutInput(input, 'Phase 2 timeout')
    },
    {
      default: false,
      message: 'Enable i18n ESLint rules (no-literal-string in JSX text)?',
      name: 'enableI18nRules',
      type: 'confirm'
    },
    {
      default: path.join(process.cwd(), CONFIG_FILE_NAMES.YAML),
      message: 'Path for the new config file',
      name: 'outputPath',
      type: 'input',
      validate: (input: string) => validateRequiredField(input, 'Path is required')
    }
  ])
}

async function promptFixersTimeoutsOutput(): Promise<Step2Answers> {
  const chk = await promptFixerCheckbox()
  const rest = await promptTimeoutsI18nOutput()

  return { ...chk, ...rest }
}

async function confirmOverwrite(outputPath: string): Promise<boolean> {
  const { overwrite } = await inquirer.prompt<{ overwrite: boolean }>([
    {
      default: false,
      message: `File exists: ${outputPath}. Overwrite?`,
      name: 'overwrite',
      type: 'confirm'
    }
  ])

  return overwrite
}

function promptStep1(): Promise<Step1Answers> {
  return inquirer.prompt<Step1Answers>([
    {
      default: './',
      message: 'Project root (relative to the config file directory, or absolute)',
      name: 'projectRoot',
      type: 'input',
      validate: (input: string) => validateRequiredField(input, 'Project root is required')
    },
    {
      default: false,
      message: 'Enable SonarQube (Phase 2)?',
      name: 'useSonar',
      type: 'confirm'
    }
  ])
}

export async function promptSetupWizardModel(): Promise<SetupWizardModel | 'aborted'> {
  const step1 = await promptStep1()

  let sonar: SetupWizardModel['sonar']

  if (step1.useSonar) sonar = await promptSonarBlock()

  const step2 = await promptFixersTimeoutsOutput()
  const outputPath = path.resolve(step2.outputPath.trim())

  if (fs.existsSync(outputPath)) {
    const ok = await confirmOverwrite(outputPath)

    if (!ok) return 'aborted'
  }

  const fixers: FixerConfig = fixersFromSelection(step2.fixerKeys)
  const phase1Timeout = parsePositiveInt(step2.phase1TimeoutRaw, 'Phase 1 timeout')
  const phase2Timeout = parsePositiveInt(step2.phase2TimeoutRaw, 'Phase 2 timeout')

  const model: SetupWizardModel = {
    enableI18nRules: step2.enableI18nRules,
    fixers,
    outputPath,
    phase1Timeout,
    phase2Timeout,
    projectRoot: step1.projectRoot.trim()
  }

  if (sonar !== undefined) model.sonar = sonar

  return model
}
