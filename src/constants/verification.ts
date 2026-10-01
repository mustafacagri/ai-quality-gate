/** Check outcomes and child process policy shared by verifier consumers. */
export const CHECK_STATUS = { PASS: 'PASS', FAIL: 'FAIL', ERROR: 'ERROR' } as const
export type CheckStatus = (typeof CHECK_STATUS)[keyof typeof CHECK_STATUS]
export const VERIFIER_TOOL_MODULE = {
  ESLINT: { package: 'eslint/package.json', binary: 'bin/eslint.js' },
  TYPESCRIPT: { package: 'typescript/package.json', binary: 'bin/tsc' },
  PRETTIER: { package: 'prettier/package.json', binary: 'bin/prettier.cjs' }
} as const
export const STRICT_LINT_ARGUMENTS = ['--max-warnings', '0', '--format', 'json', '--no-ignore'] as const
export const VERIFICATION_ERROR_CODE = { TYPESCRIPT: 'TYPECHECK_FAILED', ESLINT: 'LINT_FAILED' } as const
export const TYPECHECK_CACHE_PREFIX = 'aqg-typecheck-'
export const TYPECHECK_CACHE_FILENAME = 'tsconfig.tsbuildinfo'
