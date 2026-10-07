/**
 * Transaction Manager
 * Atomic operations with rollback capability
 * Zero risk - all or nothing
 */

import path from 'node:path'

import { FILE_SYSTEM_ERROR_CODE } from '@/constants/fileSystem'
import { transactionFileSync } from '@/core/transactionFileSync'
import type { Transaction } from '@/types'
import { errorMessage } from '@/utils/errorMessage'

interface FileSnapshot {
  existed: boolean
  content: string
}

const isFileNotFound = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false

  if (!('code' in error)) return false

  return error.code === FILE_SYSTEM_ERROR_CODE.NOT_FOUND
}

// ═══════════════════════════════════════════════════════════════════════════
// Transaction Implementation
// ═══════════════════════════════════════════════════════════════════════════

/** A rollback that could not restore every file. The files it did restore are listed too. */
export class RollbackError extends Error {
  readonly failures: readonly { file: string; message: string }[]
  readonly restored: readonly string[]

  constructor(failures: readonly { file: string; message: string }[], restored: readonly string[]) {
    const reasons = failures.map(failure => `Failed to restore ${failure.file}: ${failure.message}`)

    super(`Rollback partially failed: ${reasons.join('; ')}`)
    this.name = 'RollbackError'
    this.failures = failures
    this.restored = restored
  }
}

class TransactionImpl implements Transaction {
  private readonly backups = new Map<string, FileSnapshot>()
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
        this.backups.set(absolutePath, { existed: true, content })
      } catch (error) {
        if (!isFileNotFound(error)) throw error

        this.backups.set(absolutePath, { existed: false, content: '' })
      }
    }
  }

  /** Why no more can be done with this transaction, or undefined while it is still open. */
  private closedError(): Error | undefined {
    if (this.committed) return new Error('Transaction already committed')

    if (this.rolledBack) return new Error('Transaction already rolled back')

    return undefined
  }

  /**
   * Commit transaction - clear backups, changes are permanent
   */
  commit(): Promise<void> {
    const closed = this.closedError()

    if (closed !== undefined) return Promise.reject(closed)

    this.backups.clear()
    this.committed = true

    return Promise.resolve()
  }

  /**
   * Rollback transaction - restore all files to original state
   */
  rollback(): Promise<void> {
    const closed = this.closedError()

    if (closed !== undefined) return Promise.reject(closed)

    const failures: { file: string; message: string }[] = []
    const restored: string[] = []

    for (const [filePath, snapshot] of this.backups) {
      try {
        if (snapshot.existed) transactionFileSync.writeFileSync(filePath, snapshot.content, 'utf8')
        else if (transactionFileSync.existsSync(filePath)) transactionFileSync.unlinkSync(filePath)

        restored.push(filePath)
      } catch (error) {
        failures.push({ file: filePath, message: errorMessage(error) })
      }
    }

    this.backups.clear()
    this.rolledBack = true

    if (failures.length > 0) return Promise.reject(new RollbackError(failures, restored))

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
