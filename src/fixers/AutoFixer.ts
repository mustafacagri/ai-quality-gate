/**
 * AutoFixer Coordinator
 * Manages all AST-based fixers
 *
 * Key principle: Fixers are NOT dependent on ESLint rules
 * They scan files directly via AST
 *
 */

import { DEFAULT_FIXER_CONFIG, type Fixer, type FixSummary, type Transaction, type FixerConfig } from '@/types'
import { FIXER_TYPE, isLintableFile } from '@/constants'
import { CurlyBracesFixer } from './CurlyBracesFixer'
import { SingleLineArrowFixer } from './SingleLineArrowFixer'
import { errorMessage } from '@/utils/errorMessage'
import { emptyFixSummary } from '@/utils/fixSummary'
// Note: FunctionToArrowFixer removed - utility functions should use named function declarations
// for better stack traces, hoisting, and debuggability (Principal level decision)

export class AutoFixer {
  private readonly fixers: Fixer[]
  private skipped: string[] = []

  constructor(fixerConfig: FixerConfig = DEFAULT_FIXER_CONFIG) {
    this.fixers = []

    if (fixerConfig.curlyBraces) this.fixers.push(new CurlyBracesFixer())

    if (fixerConfig.singleLineArrow) this.fixers.push(new SingleLineArrowFixer())
  }

  /**
   * Scan all files and apply fixes
   *
   * @param files - Array of file paths to scan
   * @param transaction - Transaction for rollback support
   * @returns Summary of fixes applied
   */
  async scanAndFix(files: string[], transaction: Transaction): Promise<FixSummary> {
    const summary = emptyFixSummary()

    const eligibleFiles = this.filterEligibleFiles(files)

    for (const file of eligibleFiles) {
      await this.processFileWithFixers(file, transaction, summary)
    }

    return summary
  }

  /**
   * Lintable sources, including Vue SFCs. Script blocks are edited in place.
   */
  private filterEligibleFiles(files: string[]): string[] {
    return files.filter(file => isLintableFile(file))
  }

  /**
   * Process single file with all fixers
   */
  private async processFileWithFixers(file: string, transaction: Transaction, summary: FixSummary): Promise<void> {
    for (const fixer of this.fixers) {
      await this.runFixer(fixer, file, transaction, summary)
    }
  }

  /**
   * Run single fixer on file
   */
  private async runFixer(fixer: Fixer, file: string, transaction: Transaction, summary: FixSummary): Promise<void> {
    try {
      const fixes = await fixer.scanAndFix(file, transaction)

      this.updateSummary(summary, fixer.name, fixes.length)

      if (fixes.length > 0) console.error(`[AutoFixer] ${fixer.name}: ${fixes.length} fixes in ${file}`)
    } catch (error) {
      console.error(`[AutoFixer] Error in ${fixer.name} for ${file}:`, error)

      this.skipped.push(`${fixer.name} skipped ${file}: ${errorMessage(error)}`)
    }

    this.skipped.push(...(fixer.takeSkipped?.() ?? []))
  }

  /** Files a fixer could not process since the last call, one line each. Clears the list. */
  drainSkipped(): string[] {
    const drained = this.skipped

    this.skipped = []

    return drained
  }

  /**
   * Update summary based on fixer type
   */
  private updateSummary(summary: FixSummary, fixerName: string, count: number): void {
    if (fixerName === FIXER_TYPE.CURLY_BRACES) summary.curlyBraces += count
    if (fixerName === FIXER_TYPE.SINGLE_LINE_ARROW) summary.singleLineArrow += count
  }

  /**
   * Get list of registered fixers
   */
  getFixerNames(): string[] {
    return this.fixers.map(f => f.name)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Singleton Export
// ═══════════════════════════════════════════════════════════════════════════

export const autoFixer = new AutoFixer(DEFAULT_FIXER_CONFIG)
