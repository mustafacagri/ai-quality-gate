/**
 * Transaction Manager
 * Atomic operations with rollback capability
 * Zero risk - all or nothing
 */

import path from 'node:path'

import { transactionFileSync } from '@/core/transactionFileSync'
import type { Transaction } from '@/types'

// ═══════════════════════════════════════════════════════════════════════════
// Transaction Implementation
// ═══════════════════════════════════════════════════════════════════════════

class TransactionImpl implements Transaction {
  private readonly backups = new Map<string, string>()
  private committed = false
  private rolledBack = false

  /**
   * Record file content before modification
   * Only records once per file (first call wins)
   */
  recordChange(file: string): void {
    if (this.committed || this.rolledBack) throw new Error('Transaction already finalized')

    const absolutePath = path.resolve(file)

    // Only record if not already backed up
    if (!this.backups.has(absolutePath)) {
      try {
        const content = transactionFileSync.readFileSync(absolutePath, 'utf8')
        this.backups.set(absolutePath, content)
      } catch {
        // File doesn't exist yet - record empty for deletion on rollback
        this.backups.set(absolutePath, '')
      }
    }
  }

  /**
   * Commit transaction - clear backups, changes are permanent
   */
  commit(): Promise<void> {
    if (this.committed) return Promise.reject(new Error('Transaction already committed'))

    if (this.rolledBack) return Promise.reject(new Error('Transaction already rolled back'))

    this.backups.clear()
    this.committed = true

    return Promise.resolve()
  }

  /**
   * Rollback transaction - restore all files to original state
   */
  rollback(): Promise<void> {
    if (this.committed) return Promise.reject(new Error('Transaction already committed'))

    if (this.rolledBack) return Promise.reject(new Error('Transaction already rolled back'))

    const errors: string[] = []

    for (const [filePath, originalContent] of this.backups) {
      try {
        if (originalContent === '') {
          if (transactionFileSync.existsSync(filePath)) transactionFileSync.unlinkSync(filePath)
        } else transactionFileSync.writeFileSync(filePath, originalContent, 'utf8')
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        errors.push(`Failed to restore ${filePath}: ${message}`)
      }
    }

    this.backups.clear()
    this.rolledBack = true

    if (errors.length > 0) return Promise.reject(new Error(`Rollback partially failed: ${errors.join('; ')}`))

    return Promise.resolve()
  }

  /**
   * Get count of backed up files
   */
  getBackupCount(): number {
    return this.backups.size
  }

  /**
   * Check if file is backed up
   */
  isBackedUp(file: string): boolean {
    return this.backups.has(path.resolve(file))
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Transaction Manager
// ═══════════════════════════════════════════════════════════════════════════

export class TransactionManager {
  /**
   * Begin a new transaction
   */
  begin(): Transaction {
    return new TransactionImpl()
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Singleton Export
// ═══════════════════════════════════════════════════════════════════════════

export const transactionManager = new TransactionManager()
