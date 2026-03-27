/**
 * Known ESLint config entry filenames at project root (flat + legacy).
 * Order: flat config first, then eslintrc variants.
 */
export const ESLINT_PROJECT_ROOT_CONFIG_FILENAMES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.eslintrc.cjs',
  '.eslintrc.js',
  '.eslintrc.json',
  '.eslintrc.yaml',
  '.eslintrc.yml'
] as const
