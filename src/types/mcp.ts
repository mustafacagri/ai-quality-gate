/**
 * MCP Types - Tool parameters and responses
 */

import type { Phase, FixerType } from './core'
import type { Issue, QualityError } from './issue'

// ═══════════════════════════════════════════════════════════════════════════
// MCP Tool Input/Output
// ═══════════════════════════════════════════════════════════════════════════

export interface QualityFixParams {
  files: string[]
}

export interface QualityFixResponse {
  phase: Phase
  success: boolean
  message: string
  fixed: FixSummary
  remaining: Issue[]
  timing: Timing
  error?: QualityError
  /** Total number of issues found (fixed + remaining) */
  totalIssues?: number
  /** Number of issues that need manual fixing (remaining) */
  remainingCount?: number
  /** Number of issues auto-fixed */
  fixedCount?: number
}

// ═══════════════════════════════════════════════════════════════════════════
// Summary & Timing
// ═══════════════════════════════════════════════════════════════════════════

export interface FixSummary {
  /** ESLint auto-fix count (includes unicorn/no-array-for-each, unicorn/no-nested-ternary, unused-imports, etc.) */
  eslint: number
  /** Unnecessary curly braces removed from single-statement if blocks (AST fixer) */
  curlyBraces: number
  /** Multi-line single-statement arrow functions converted to single line (AST fixer) */
  singleLineArrow: number
  /** Files formatted by Prettier */
  prettier: number
  /** JSON files validated */
  json: number
}

export interface Timing {
  phase1: string
  phase2?: string
  total: string
}

// ═══════════════════════════════════════════════════════════════════════════
// Fix Types
// ═══════════════════════════════════════════════════════════════════════════

export interface Fix {
  file: string
  line: number
  type: FixerType
  description?: string
}

export interface TransformResult {
  success: boolean
  error?: string
}
