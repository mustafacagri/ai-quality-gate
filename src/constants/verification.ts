/** Check outcomes and child process policy shared by verifier consumers. */
export const CHECK_STATUS = { PASS: 'PASS', FAIL: 'FAIL', ERROR: 'ERROR' } as const
export type CheckStatus = (typeof CHECK_STATUS)[keyof typeof CHECK_STATUS]
export const VERIFIER_TOOL_MODULE = {
  ESLINT: { name: 'eslint', package: 'eslint/package.json', binary: 'bin/eslint.js' },
  TYPESCRIPT: { name: 'tsc', package: 'typescript/package.json', binary: 'bin/tsc' },
  VUE_TSC: { name: 'vue-tsc', package: 'vue-tsc/package.json', binary: 'bin/vue-tsc.js' },
  PRETTIER: { name: 'prettier', package: 'prettier/package.json', binary: 'bin/prettier.cjs' }
} as const

/** Flags of `tsc` and `vue-tsc`, which take the same ones. */
export const TYPECHECK_FLAG = {
  NO_EMIT: '--noEmit',
  INCREMENTAL: '--incremental',
  BUILD_INFO_FILE: '--tsBuildInfoFile',
  PRETTY: '--pretty',
  PROJECT: '--project',
  LIST_FILES_ONLY: '--listFilesOnly'
} as const
/** Flags of `prettier`. It colours `[error]` whenever `CI` is set, which would hide the line the failing file is read from. */
export const PRETTIER_FLAG = { WRITE: '--write', NO_COLOR: '--no-color' } as const
export const STRICT_LINT_ARGUMENTS = ['--max-warnings', '0', '--format', 'json', '--no-ignore'] as const
export const VERIFICATION_ERROR_CODE = { TYPESCRIPT: 'TYPECHECK_FAILED', ESLINT: 'LINT_FAILED' } as const
export const TYPECHECK_CACHE_PREFIX = 'aqg-typecheck-'
export const TYPECHECK_CACHE_FILENAME = 'tsconfig.tsbuildinfo'
