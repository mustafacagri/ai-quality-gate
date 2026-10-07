/**
 * MCP Types - Tool parameters and responses
 */

import type { VerificationChecks } from './verification'
import type { Phase, FixerType } from './core'
import type { Issue, QualityError } from './issue'

// ═══════════════════════════════════════════════════════════════════════════
// MCP Tool Input/Output
// ═══════════════════════════════════════════════════════════════════════════

export interface QualityFixParams {
  files: string[]
}

export interface QualityFixResponse {
  checks?: VerificationChecks
  phase: Phase
  success: boolean
  message: string
  /**
   * Edits on disk after the run. They stay when only findings the fixers cannot fix remain.
   * Zero when the run was rolled back because a fixer broke the code.
   */
  fixed: FixSummary
  /**
   * Edits applied before a rollback. Absent when nothing was rolled back.
   * After a successful rollback these counts are not on disk. With `ROLLBACK_FAILED` the files
   * may still contain them.
   */
  attempted?: FixSummary
  /**
   * Things the gate could not do that do not fail the run, one line each: a file an AST fixer skipped because it
   * could not be processed, a custom rule it could not apply. Absent when there are none.
   */
  warnings?: string[]
  /**
   * Issues that block the run. Line numbers refer to the files as they are on disk: after kept edits because the
   * edits stay, after a rollback because they come from a read-only check of the restored files. Line `0` marks an
   * issue whose location is unknown.
   */
  remaining: Issue[]
  timing: Timing
  error?: QualityError
  /** Durable fixes plus remaining issues. Rolled-back edits are not included. */
  totalIssues?: number
  /** Number of issues that need manual fixing (remaining) */
  remainingCount?: number
  /** Number of durable auto-fixes still on disk */
  fixedCount?: number
  /** Number of edits that were attempted and then rolled back */
  attemptedCount?: number
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
