/**
 * Fixer Types
 * AST-based automatic code fixers
 */

export const FIXER_TYPE = {
  /** Remove unnecessary curly braces from single-statement if blocks */
  CURLY_BRACES: 'curlyBraces',
  /** Convert multi-line single-statement arrow functions to single line */
  SINGLE_LINE_ARROW: 'singleLineArrow'
} as const

export type FixerType = (typeof FIXER_TYPE)[keyof typeof FIXER_TYPE]
