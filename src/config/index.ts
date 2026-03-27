/**
 * Configuration Module
 * Barrel Export
 */

// Schema & Environment
export { ConfigSchema, ENV_KEYS, CONFIG_DEFAULTS } from './schema'
export type { EnvKey, ConfigInput, ConfigOutput } from './schema'

// Manager
export { ConfigManager, configManager } from './ConfigManager'

// Config file (YAML/JSON) helpers
export {
  discoverConfigFilePath,
  loadConfigFile,
  mergeConfigFileWithEnv,
  normalizeRawConfig,
  resolveExplicitConfigPath,
  resolveProjectRootAgainstConfigFile
} from './configFile'
