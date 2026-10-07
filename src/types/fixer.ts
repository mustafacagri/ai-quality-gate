/**
 * Fixer Types - Auto-fixer interfaces
 */

import type { SourceFile } from 'ts-morph'

import type { FixerType } from './core'
import type { Fix } from './mcp'

// ═══════════════════════════════════════════════════════════════════════════
// Transaction Interface
// ═══════════════════════════════════════════════════════════════════════════

export interface Transaction {
  recordChange: (file: string) => void
  commit: () => Promise<void>
  rollback: () => Promise<void>
}

// ═══════════════════════════════════════════════════════════════════════════
// Fixer Interface
// ═══════════════════════════════════════════════════════════════════════════

export interface Fixer {
  readonly name: FixerType
  scanAndFix: (filePath: string, transaction: Transaction) => Promise<Fix[]>
  /** Files the fixer could not process since the last call, one line each. Clears the list. */
  takeSkipped?: () => string[]
}

/**
 * One JavaScript or TypeScript program the AST fixers can edit.
 * For a Vue SFC this is a single `<script>` or `<script setup>` block, not the whole file.
 */
export interface ScriptUnit {
  readonly sourceFile: SourceFile
  toFileLine: (scriptLine: number) => number
}

export interface ScriptEditSession {
  readonly units: readonly ScriptUnit[]
  commit: () => Promise<void>
  dispose: () => void
}
