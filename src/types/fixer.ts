/**
 * Fixer Types - Auto-fixer interfaces
 */

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
}
