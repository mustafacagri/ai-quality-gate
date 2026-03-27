/**
 * Core Types - Fundamental types used across the application
 */

import type { FIXER_TYPE } from '@/constants'

export type Severity = 'error' | 'info' | 'warning'
export type Phase = 'complete' | 'local' | 'server'

/**
 * AST Fixer Types - Derived from FIXER_TYPE constant
 */
export type FixerType = (typeof FIXER_TYPE)[keyof typeof FIXER_TYPE]
