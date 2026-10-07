/**
 * Marker files used to infer a repository root when walking up from a directory.
 */
export const PACKAGE_JSON = 'package.json'
export const TSCONFIG_JSON = 'tsconfig.json'

export const PROJECT_ROOT_MARKER_FILES = [PACKAGE_JSON, TSCONFIG_JSON] as const
