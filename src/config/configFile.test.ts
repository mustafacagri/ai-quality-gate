import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { CONFIG_FILE_NAMES } from '@/constants/config-files'
import {
  discoverConfigFilePath,
  loadConfigFile,
  mergeConfigFileWithEnv,
  normalizeRawConfig,
  resolveProjectRootAgainstConfigFile
} from '@/config/configFile'

const makeTempDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-cfg-'))

describe('configFile', () => {
  it('discovers YAML before JSON in the same directory', () => {
    const root = makeTempDir()

    fs.writeFileSync(path.join(root, CONFIG_FILE_NAMES.JSON), '{}', 'utf8')
    fs.writeFileSync(path.join(root, CONFIG_FILE_NAMES.YAML), 'projectRoot: /x', 'utf8')

    expect(discoverConfigFilePath(root)).toBe(path.join(root, CONFIG_FILE_NAMES.YAML))
  })

  it('discovers JSON when YAML is absent', () => {
    const root = makeTempDir()

    fs.writeFileSync(path.join(root, CONFIG_FILE_NAMES.JSON), '{"projectRoot":"/y"}', 'utf8')

    expect(discoverConfigFilePath(root)).toBe(path.join(root, CONFIG_FILE_NAMES.JSON))
  })

  it('walks up to parent directory to find config', () => {
    const root = makeTempDir()
    const child = path.join(root, 'packages', 'app')

    fs.mkdirSync(child, { recursive: true })
    fs.writeFileSync(path.join(root, CONFIG_FILE_NAMES.YAML), 'projectRoot: /z', 'utf8')

    expect(discoverConfigFilePath(child)).toBe(path.join(root, CONFIG_FILE_NAMES.YAML))
  })

  it('loads JSON and YAML', () => {
    const root = makeTempDir()
    const jsonPath = path.join(root, 'c.json')

    fs.writeFileSync(jsonPath, '{"a":1}', 'utf8')

    expect(loadConfigFile(jsonPath)).toEqual({ a: 1 })

    const yamlPath = path.join(root, 'c.yaml')

    fs.writeFileSync(yamlPath, 'b: 2', 'utf8')

    expect(loadConfigFile(yamlPath)).toEqual({ b: 2 })
  })

  it('normalizes nested sonar block', () => {
    const raw = normalizeRawConfig({
      sonar: {
        hostUrl: 'https://sq.example.com',
        token: 't',
        projectKey: 'pk'
      }
    })

    expect(raw['sonarHostUrl']).toBe('https://sq.example.com')
    expect(raw['sonarToken']).toBe('t')
    expect(raw['sonarProjectKey']).toBe('pk')
    expect(raw['sonar']).toBeUndefined()
  })

  it('merges env over file', () => {
    const merged = mergeConfigFileWithEnv(
      { projectRoot: '/a', phase1Timeout: 5000 },
      { projectRoot: '/b', phase1Timeout: undefined }
    )

    expect(merged['projectRoot']).toBe('/b')
    expect(merged['phase1Timeout']).toBe(5000)
  })

  it('resolves relative projectRoot against config file directory', () => {
    const root = makeTempDir()
    const cfg = path.join(root, CONFIG_FILE_NAMES.YAML)

    const raw: Record<string, unknown> = { projectRoot: './sub' }

    resolveProjectRootAgainstConfigFile(raw, cfg)

    expect(raw['projectRoot']).toBe(path.join(root, 'sub'))
  })
})
