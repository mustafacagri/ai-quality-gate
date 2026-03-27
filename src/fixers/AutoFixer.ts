/**
 * AutoFixer Coordinator
 * Manages all AST-based fixers
 *
 * Key principle: Fixers are NOT dependent on ESLint rules
 * They scan files directly via AST
 *
 */

import { DEFAULT_FIXER_CONFIG, type Fixer, type FixSummary, type Transaction, type FixerConfig } from '@/types'
import { FIXER_TYPE } from '@/constants'
import { CurlyBracesFixer } from './CurlyBracesFixer'
import { SingleLineArrowFixer } from './SingleLineArrowFixer'
// Note: FunctionToArrowFixer removed - utility functions should use named function declarations
// for better stack traces, hoisting, and debuggability (Principal level decision)

export class AutoFixer {
  private readonly fixers: Fixer[]

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
    const summary: FixSummary = {
      eslint: 0,
      curlyBraces: 0,
      singleLineArrow: 0,
      prettier: 0,
      json: 0
    }

    const eligibleFiles = this.filterEligibleFiles(files)

    for (const file of eligibleFiles) {
      await this.processFileWithFixers(file, transaction, summary)
    }

    return summary
  }

  /**
   * Filter to TypeScript/JavaScript files only
   */
  private filterEligibleFiles(files: string[]): string[] {
    const extensions = ['.ts', '.tsx', '.js', '.jsx']

    return files.filter(file => extensions.some(ext => file.endsWith(ext)))
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
    }
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
