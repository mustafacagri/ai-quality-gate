/**
 * Config file discovery, parsing (YAML/JSON), normalization, and merge with ENV.
 * Merge order: Zod defaults apply after merge → defaults < config file < ENV
 */

import fs from 'node:fs'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'

import { CONFIG_FILE_NAMES } from '@/constants/config-files'

/** Nested `sonar` block in YAML/JSON maps to flat Config fields */
interface SonarBlock {
  hostUrl?: string
  token?: string
  projectKey?: string
  scannerPath?: string
}

/**
 * Walk upward from `startDir` until filesystem root; prefer YAML over JSON in each directory.
 */
export const discoverConfigFilePath = (startDir: string): string | undefined => {
  let current = path.resolve(startDir)

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- walk up until filesystem root
  while (true) {
    const yamlPath = path.join(current, CONFIG_FILE_NAMES.YAML)

    if (fs.existsSync(yamlPath)) return yamlPath

    const jsonPath = path.join(current, CONFIG_FILE_NAMES.JSON)

    if (fs.existsSync(jsonPath)) return jsonPath

    const parent = path.dirname(current)

    if (parent === current) break

    current = parent
  }

  return undefined
}

/**
 * Resolve explicit config path (absolute or relative to cwd). Throws if missing.
 */
export const resolveExplicitConfigPath = (explicitPath: string): string => {
  const resolved = path.resolve(explicitPath)

  if (!fs.existsSync(resolved)) throw new Error(`Config file not found: ${resolved}`)

  return resolved
}

/**
 * Load and parse a config file (YAML or JSON by extension).
 */
export const loadConfigFile = (absolutePath: string): Record<string, unknown> => {
  const text = fs.readFileSync(absolutePath, 'utf8')
  const ext = path.extname(absolutePath).toLowerCase()

  if (ext === '.json') {
    const parsed = JSON.parse(text) as unknown

    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  }

  const parsed = parseYaml(text) as unknown

  if (parsed === null || parsed === undefined) return {}

  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError(`Invalid YAML config (expected object): ${absolutePath}`)
  }

  return parsed as Record<string, unknown>
}

/**
 * Flatten `sonar` nested object; coerce numeric / boolean strings where needed.
 */
export const normalizeRawConfig = (raw: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...raw }

  const sonar = out['sonar']

  if (sonar !== null && typeof sonar === 'object' && !Array.isArray(sonar)) {
    const s = sonar as SonarBlock

    if (s.hostUrl !== undefined) out['sonarHostUrl'] = s.hostUrl
    if (s.token !== undefined) out['sonarToken'] = s.token
    if (s.projectKey !== undefined) out['sonarProjectKey'] = s.projectKey
    if (s.scannerPath !== undefined) out['sonarScannerPath'] = s.scannerPath

    Reflect.deleteProperty(out, 'sonar')
  }

  coerceConfigFields(out)

  return out
}

const coerceConfigFields = (raw: Record<string, unknown>): void => {
  const timeoutKeys = ['phase1Timeout', 'phase2Timeout'] as const

  for (const k of timeoutKeys) {
    const v = raw[k]

    if (typeof v === 'string' && /^\d+$/.test(v.trim())) raw[k] = Number.parseInt(v.trim(), 10)
  }

  const e = raw['enableI18nRules']

  if (typeof e === 'string') {
    const lower = e.toLowerCase()

    if (lower === 'true') raw['enableI18nRules'] = true
    else if (lower === 'false') raw['enableI18nRules'] = false
  }

  coerceFixersBooleanStrings(raw)
}

const coerceFixersBooleanStrings = (raw: Record<string, unknown>): void => {
  const fixersRaw = raw['fixers']

  if (fixersRaw === null || typeof fixersRaw !== 'object' || Array.isArray(fixersRaw)) return

  const fx = fixersRaw as Record<string, unknown>
  const keys = ['eslint', 'curlyBraces', 'singleLineArrow', 'prettier', 'jsonValidator'] as const

  for (const k of keys) {
    const v = fx[k]

    if (typeof v === 'string') {
      const lower = v.toLowerCase()

      if (lower === 'true') fx[k] = true
      else if (lower === 'false') fx[k] = false
    }
  }
}

/**
 * Resolve relative `projectRoot` against the directory containing the config file.
 */
export const resolveProjectRootAgainstConfigFile = (raw: Record<string, unknown>, configFilePath: string): void => {
  const pr = raw['projectRoot']

  if (typeof pr !== 'string' || pr.length === 0) return

  if (path.isAbsolute(pr)) return

  const configDir = path.dirname(configFilePath)

  raw['projectRoot'] = path.resolve(configDir, pr)
}

/**
 * Overlay env-defined keys on top of file-defined keys (env wins).
 */
export const mergeConfigFileWithEnv = (
  filePartial: Record<string, unknown>,
  envPartial: Record<string, unknown>
): Record<string, unknown> => {
  const merged = { ...filePartial }

  for (const [key, value] of Object.entries(envPartial)) {
    if (value !== undefined) merged[key] = value
  }

  return merged
}
