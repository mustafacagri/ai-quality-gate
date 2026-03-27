import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

import { ConfigManager } from '@/config/ConfigManager'
import { CONFIG_DEFAULTS, ENV_KEYS } from '@/config/schema'
import { CONFIG_FILE_NAMES } from '@/constants/config-files'

const makeTempDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-cfgm-'))

describe('ConfigManager', () => {
  const envSnapshot = { ...process.env }

  beforeEach(() => {
    process.env = { ...envSnapshot }
  })

  afterEach(() => {
    process.env = { ...envSnapshot }
  })

  it('loads valid config with defaults for timeouts', () => {
    process.env[ENV_KEYS.PROJECT_ROOT] = '/tmp/proj'

    const manager = new ConfigManager()
    const config = manager.load()

    expect(config.projectRoot).toBe('/tmp/proj')
    expect(config.phase1Timeout).toBe(CONFIG_DEFAULTS.PHASE1_TIMEOUT)
    expect(config.phase2Timeout).toBe(CONFIG_DEFAULTS.PHASE2_TIMEOUT)
    expect(config.enableI18nRules).toBe(false)
    expect(config.fixers.eslint).toBe(true)
    expect(config.fixers.jsonValidator).toBe(true)
  })

  it('infers project root when PROJECT_ROOT is unset (package.json from cwd)', () => {
    const root = makeTempDir()

    fs.writeFileSync(path.join(root, 'package.json'), '{}', 'utf8')
    Reflect.deleteProperty(process.env, ENV_KEYS.PROJECT_ROOT)

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(root)

    const manager = new ConfigManager()
    const config = manager.load()

    expect(config.projectRoot).toBe(root)

    cwdSpy.mockRestore()
  })

  it('parses optional timeouts and enableI18nRules', () => {
    process.env[ENV_KEYS.PROJECT_ROOT] = '/app'
    process.env[ENV_KEYS.PHASE1_TIMEOUT] = '12000'
    process.env[ENV_KEYS.PHASE2_TIMEOUT] = '60000'
    process.env[ENV_KEYS.ENABLE_I18N_RULES] = 'true'

    const manager = new ConfigManager()
    const config = manager.load()

    expect(config.phase1Timeout).toBe(12_000)
    expect(config.phase2Timeout).toBe(60_000)
    expect(config.enableI18nRules).toBe(true)
  })

  it('rejects invalid sonarHostUrl', () => {
    process.env[ENV_KEYS.PROJECT_ROOT] = '/app'
    process.env[ENV_KEYS.SONAR_HOST_URL] = 'not-a-valid-url'

    const manager = new ConfigManager()

    expect(() => manager.load()).toThrow(/Config:.*sonarHostUrl.*url/i)
  })

  it('isPhase2Configured is true when host, token, and project key are set', () => {
    process.env[ENV_KEYS.PROJECT_ROOT] = '/app'
    process.env[ENV_KEYS.SONAR_HOST_URL] = 'https://sonar.example.com'
    process.env[ENV_KEYS.SONAR_TOKEN] = 'secret'
    process.env[ENV_KEYS.SONAR_PROJECT_KEY] = 'my-key'

    const manager = new ConfigManager()

    expect(manager.isPhase2Configured()).toBe(true)
  })

  it('isPhase2Configured is false when sonar fields are incomplete', () => {
    process.env[ENV_KEYS.PROJECT_ROOT] = '/app'
    process.env[ENV_KEYS.SONAR_HOST_URL] = 'https://sonar.example.com'

    const manager = new ConfigManager()

    expect(manager.isPhase2Configured()).toBe(false)
  })

  it('loads YAML from project root and merges ENV over file', () => {
    const root = makeTempDir()

    process.env[ENV_KEYS.PROJECT_ROOT] = root
    Reflect.deleteProperty(process.env, ENV_KEYS.QUALITY_GATE_CONFIG)

    const yaml = [`projectRoot: .`, 'phase1Timeout: 5000', 'enableI18nRules: false'].join('\n')

    fs.writeFileSync(path.join(root, CONFIG_FILE_NAMES.YAML), yaml, 'utf8')
    process.env[ENV_KEYS.PHASE1_TIMEOUT] = '9000'

    const manager = new ConfigManager()
    const config = manager.load()

    expect(config.projectRoot).toBe(root)
    expect(config.phase1Timeout).toBe(9000)
    expect(config.enableI18nRules).toBe(false)
  })

  it('uses QUALITY_GATE_CONFIG when set', () => {
    const root = makeTempDir()
    const custom = path.join(root, 'custom.json')

    fs.writeFileSync(
      custom,
      JSON.stringify({
        projectRoot: root,
        phase2Timeout: 111_111
      }),
      'utf8'
    )

    process.env[ENV_KEYS.QUALITY_GATE_CONFIG] = custom
    process.env[ENV_KEYS.PROJECT_ROOT] = root

    const manager = new ConfigManager()
    const config = manager.load()

    expect(config.phase2Timeout).toBe(111_111)
  })

  it('parses nested sonar from YAML file', () => {
    const root = makeTempDir()

    process.env[ENV_KEYS.PROJECT_ROOT] = root

    const yaml = [
      'projectRoot: .',
      'sonar:',
      '  hostUrl: https://sonar.example.com',
      '  token: secret',
      '  projectKey: my-proj'
    ].join('\n')

    fs.writeFileSync(path.join(root, CONFIG_FILE_NAMES.YAML), yaml, 'utf8')

    const manager = new ConfigManager()

    expect(manager.isPhase2Configured()).toBe(true)
  })
})
