/**
 * Configuration Manager
 * Singleton class for loading and validating configuration
 *
 * Merge order: Zod defaults apply on parse → **defaults < config file < ENV**
 */

import path from 'node:path'

import type { ZodError } from 'zod'

import type { Config } from '@/types'
import { ENV_KEYS, ConfigSchema } from './schema'
import { findProjectRoot } from '@/utils/findProjectRoot'
import {
  discoverConfigFilePath,
  loadConfigFile,
  mergeConfigFileWithEnv,
  normalizeRawConfig,
  resolveExplicitConfigPath,
  resolveProjectRootAgainstConfigFile
} from './configFile'

function formatConfigInvalidMessage(issues: ZodError['issues']): string {
  const parts = issues.map(issue => {
    const pathStr = issue.path.length === 0 ? '(root)' : issue.path.map(String).join('.')

    return `'${pathStr}' ${issue.message}`
  })

  return `Config: ${parts.join('; ')}`
}

// ═══════════════════════════════════════════════════════════════════════════
// ConfigManager Class
// ═══════════════════════════════════════════════════════════════════════════

export class ConfigManager {
  private config: Config | null = null

  /**
   * Load and validate configuration (optional YAML/JSON file + environment variables)
   * @throws Error if validation fails
   */
  load(): Config {
    if (this.config !== null) return this.config

    const merged = this.loadMergedRaw()
    const result = ConfigSchema.safeParse(merged)

    if (!result.success) throw new Error(formatConfigInvalidMessage(result.error.issues))

    this.config = result.data as Config

    return this.config
  }

  /**
   * Merge config file (if any) with ENV; file first, then ENV overwrites defined keys.
   */
  private loadMergedRaw(): Record<string, unknown> {
    const envRaw = this.readFromEnv()
    const explicit = process.env[ENV_KEYS.QUALITY_GATE_CONFIG]?.trim()
    const projectRootEnv = process.env[ENV_KEYS.PROJECT_ROOT]?.trim()
    const configDiscoveryStartDir = projectRootEnv ? path.resolve(projectRootEnv) : findProjectRoot(process.cwd())

    let fileRaw: Record<string, unknown> = {}

    if (explicit && explicit.length > 0) {
      const configPath = resolveExplicitConfigPath(explicit)

      fileRaw = loadConfigFile(configPath)
      fileRaw = normalizeRawConfig(fileRaw)
      resolveProjectRootAgainstConfigFile(fileRaw, configPath)
    } else {
      const discovered = discoverConfigFilePath(configDiscoveryStartDir)

      if (discovered) {
        fileRaw = loadConfigFile(discovered)
        fileRaw = normalizeRawConfig(fileRaw)
        resolveProjectRootAgainstConfigFile(fileRaw, discovered)
      }
    }

    const merged = mergeConfigFileWithEnv(fileRaw, envRaw)

    this.ensureProjectRoot(merged)

    return merged
  }

  /**
   * Ensure `projectRoot` is set: env `PROJECT_ROOT`, then config merge, else walk up from cwd.
   */
  private ensureProjectRoot(merged: Record<string, unknown>): void {
    type WithRoot = Record<string, unknown> & { projectRoot?: unknown }
    const m = merged as WithRoot
    const existing = m.projectRoot

    if (typeof existing === 'string' && existing.trim().length > 0) return

    const fromEnv = process.env[ENV_KEYS.PROJECT_ROOT]?.trim()

    m.projectRoot = fromEnv && fromEnv.length > 0 ? path.resolve(fromEnv) : findProjectRoot(process.cwd())
  }

  /**
   * Check if Phase 2 (SonarQube Server) is configured
   */
  isPhase2Configured(): boolean {
    const config = this.load()

    return Boolean(config.sonarHostUrl && config.sonarToken && config.sonarProjectKey)
  }

  /**
   * Reset cached config (useful for testing)
   */
  reset(): void {
    this.config = null
  }

  /**
   * Read raw values from environment variables
   */
  private readFromEnv(): Record<string, unknown> {
    const { env } = process

    return {
      projectRoot: env[ENV_KEYS.PROJECT_ROOT],
      sonarHostUrl: env[ENV_KEYS.SONAR_HOST_URL],
      sonarToken: env[ENV_KEYS.SONAR_TOKEN],
      sonarProjectKey: env[ENV_KEYS.SONAR_PROJECT_KEY],
      sonarScannerPath: env[ENV_KEYS.SONAR_SCANNER_PATH],
      phase1Timeout: this.parseNumber(env[ENV_KEYS.PHASE1_TIMEOUT]),
      phase2Timeout: this.parseNumber(env[ENV_KEYS.PHASE2_TIMEOUT]),
      enableI18nRules: this.parseBoolean(env[ENV_KEYS.ENABLE_I18N_RULES])
    }
  }

  /**
   * Parse string to boolean, return undefined if invalid
   */
  private parseBoolean(value: string | undefined): boolean | undefined {
    if (value === undefined) return undefined

    return value.toLowerCase() === 'true'
  }

  /**
   * Parse string to number, return undefined if invalid
   */
  private parseNumber(value: string | undefined): number | undefined {
    if (value === undefined) return undefined

    const num = Number.parseInt(value, 10)

    return Number.isNaN(num) ? undefined : num
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Singleton Instance
// ═══════════════════════════════════════════════════════════════════════════

export const configManager = new ConfigManager()
