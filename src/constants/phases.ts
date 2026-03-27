/**
 * Phase Names
 * Quality gate execution phases
 */

export const PHASE = {
  /** Local analysis - TypeScript + ESLint + AST fixers (~2-3s) */
  LOCAL: 'local',
  /** Server analysis - SonarQube deep scan (~30-60s) */
  SERVER: 'server',
  /** All phases completed successfully */
  COMPLETE: 'complete'
} as const

export type Phase = (typeof PHASE)[keyof typeof PHASE]
