/**
 * Phase 1: Local Analysis
 * Fast checks with ESLint + SonarJS + AST fixers + JSON validation
 * Always runs (~2-3 seconds)
 */

import type { Config, Issue, LocalResult, Transaction, FixSummary, Phase1RunOptions } from '@/types'
import { Verifier } from '@/core'
import { AutoFixer } from '@/fixers'
import { CustomRulesValidator, JsonValidator, type JsonValidationResult } from '@/validators'
import { isJsonFile, isLintableFile } from '@/constants'

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

/** Maximum i18n issues to display in console */
const MAX_I18N_ISSUES_TO_DISPLAY = 5

// ═══════════════════════════════════════════════════════════════════════════
// Phase 1 Local
// ═══════════════════════════════════════════════════════════════════════════

export class Phase1Local {
  private readonly config: Config
  private readonly verifier: Verifier
  private readonly autoFixer: AutoFixer
  private readonly jsonValidator: JsonValidator
  private readonly customRulesValidator: CustomRulesValidator

  constructor(config: Config) {
    this.config = config
    this.verifier = new Verifier(config)
    this.autoFixer = new AutoFixer(config.fixers)
    this.jsonValidator = new JsonValidator()
    this.customRulesValidator = new CustomRulesValidator()
  }

  /**
   * Run Phase 1 local analysis
   * @param options.phase1Mode `check` = typecheck + lint verify only (no file mutations). Default `fix`.
   *
   * **i18n locale key consistency** (JSON validator): extra/missing keys across locale files are reported
   * via stderr warnings only; they do **not** set `passed: false` for Phase 1.
   */
  async run(files: string[], transaction: Transaction, options?: Phase1RunOptions): Promise<LocalResult> {
    const fixSummary = this.createEmptyFixSummary()
    const { jsonFiles, codeFiles } = this.categorizeFiles(files)
    const phase1Mode = options?.phase1Mode ?? 'fix'

    // Step 0: JSON Validation
    const jsonResult = await this.runJsonValidation(jsonFiles, fixSummary)

    if (jsonResult) return jsonResult

    // If no code files, return success
    if (codeFiles.length === 0) {
      return { passed: true, fixed: fixSummary, issues: [] }
    }

    if (phase1Mode === 'check') return this.runCodeAnalysisCheck(codeFiles, fixSummary)

    return this.runCodeAnalysis(codeFiles, transaction, fixSummary)
  }

  /**
   * Create empty fix summary
   */
  private createEmptyFixSummary(): FixSummary {
    return {
      eslint: 0,
      curlyBraces: 0,
      singleLineArrow: 0,
      prettier: 0,
      json: 0
    }
  }

  /**
   * Categorize files by type
   */
  private categorizeFiles(files: string[]): { jsonFiles: string[]; codeFiles: string[] } {
    return {
      jsonFiles: files.filter(f => isJsonFile(f)),
      codeFiles: files.filter(f => isLintableFile(f))
    }
  }

  /**
   * Run JSON validation and return early if parse/BOM (or other blocking) issues exist.
   * i18n key mismatches never return early here — they are logged in {@link logI18nIssues} only.
   */
  private async runJsonValidation(jsonFiles: string[], fixSummary: FixSummary): Promise<LocalResult | null> {
    if (jsonFiles.length === 0) return null

    if (!this.config.fixers.jsonValidator) return null

    const jsonResult = await this.jsonValidator.validate(jsonFiles)
    fixSummary.json = jsonResult.validCount

    if (!jsonResult.passed) {
      return { passed: false, fixed: fixSummary, issues: jsonResult.issues }
    }

    this.logI18nIssues(jsonResult)

    return null
  }

  /**
   * Run regex custom rules from config (optional).
   */
  private runCustomRulesPhase(codeFiles: string[]): Promise<Issue[]> {
    const rules = this.config.customRules

    if (!rules?.length) return Promise.resolve([])

    return this.customRulesValidator.validate(rules, codeFiles)
  }

  /**
   * Log i18n locale key mismatches to stderr. Does not affect Phase 1 success — informational only.
   */
  private logI18nIssues(jsonResult: JsonValidationResult): void {
    if (jsonResult.i18nIssues.length === 0) return

    console.warn(`⚠️ i18n consistency issues found: ${jsonResult.i18nIssues.length}`)

    for (const issue of jsonResult.i18nIssues.slice(0, MAX_I18N_ISSUES_TO_DISPLAY)) {
      console.warn(`  - ${issue.file}: ${issue.type} "${issue.key}"`)
    }

    if (jsonResult.i18nIssues.length > MAX_I18N_ISSUES_TO_DISPLAY) {
      const remaining = jsonResult.i18nIssues.length - MAX_I18N_ISSUES_TO_DISPLAY
      console.warn(`  ... and ${remaining} more`)
    }
  }

  /**
   * Run code analysis (TypeScript, AST fixers, ESLint, Prettier)
   */
  private async runCodeAnalysis(
    codeFiles: string[],
    transaction: Transaction,
    fixSummary: FixSummary
  ): Promise<LocalResult> {
    // Step 1: TypeScript Check
    const typecheck = await this.verifier.runTypeCheck(codeFiles)

    if (!typecheck.passed) {
      return { passed: false, fixed: fixSummary, issues: typecheck.errors }
    }

    const customIssuesEarly = await this.runCustomRulesPhase(codeFiles)

    if (customIssuesEarly.length > 0) {
      return { passed: false, fixed: fixSummary, issues: customIssuesEarly }
    }

    this.ensureTransactionPrimedForMutablePhase(codeFiles, transaction)

    const { fixers } = this.config

    // Step 2: AST Auto-Fixers
    if (fixers.curlyBraces || fixers.singleLineArrow) await this.runAstFixers(codeFiles, transaction, fixSummary)

    // Step 3: ESLint + SonarJS
    if (fixers.eslint) {
      const lintFix = await this.verifier.runLintFix(codeFiles)
      fixSummary.eslint = lintFix.fixedCount
    }

    // Step 4: Prettier
    if (fixers.prettier) {
      const prettierResult = await this.verifier.runPrettier(codeFiles)
      fixSummary.prettier = prettierResult.formattedCount
    }

    // Step 5: ESLint --fix again (Prettier may have introduced formatting that needs ESLint fixes)
    if (fixers.eslint) {
      const lintFixAfterPrettier = await this.verifier.runLintFix(codeFiles)
      fixSummary.eslint += lintFixAfterPrettier.fixedCount
    }

    // Step 6: Re-verify
    return this.verifyAfterFixes(codeFiles, fixSummary)
  }

  /**
   * Read-only Phase 1: typecheck + lint check only (no AST / ESLint --fix / Prettier writes).
   */
  private async runCodeAnalysisCheck(codeFiles: string[], fixSummary: FixSummary): Promise<LocalResult> {
    const typecheck = await this.verifier.runTypeCheck(codeFiles)

    if (!typecheck.passed) {
      return { passed: false, fixed: fixSummary, issues: typecheck.errors }
    }

    const customIssuesEarly = await this.runCustomRulesPhase(codeFiles)

    if (customIssuesEarly.length > 0) {
      return { passed: false, fixed: fixSummary, issues: customIssuesEarly }
    }

    if (!this.config.fixers.eslint) {
      return { passed: true, fixed: fixSummary, issues: [] }
    }

    const lintCheck = await this.verifier.runLintCheck(codeFiles)

    if (!lintCheck.passed) {
      return { passed: false, fixed: fixSummary, issues: lintCheck.errors }
    }

    return { passed: true, fixed: fixSummary, issues: [] }
  }

  /**
   * Backup every code file before any mutating step (AST, ESLint --fix, Prettier).
   * AST fixers call recordChange as well; first snapshot wins so we keep the pre-run content for rollback.
   */
  private ensureTransactionPrimedForMutablePhase(codeFiles: string[], transaction: Transaction): void {
    for (const file of codeFiles) {
      transaction.recordChange(file)
    }
  }

  /**
   * Run AST fixers and update summary
   */
  private async runAstFixers(codeFiles: string[], transaction: Transaction, fixSummary: FixSummary): Promise<void> {
    const astFixes = await this.autoFixer.scanAndFix(codeFiles, transaction)
    fixSummary.curlyBraces = astFixes.curlyBraces
    fixSummary.singleLineArrow = astFixes.singleLineArrow
  }

  /**
   * Re-verify after all fixes
   */
  private async verifyAfterFixes(codeFiles: string[], fixSummary: FixSummary): Promise<LocalResult> {
    // Re-run typecheck
    const recheckType = await this.verifier.runTypeCheck(codeFiles)

    if (!recheckType.passed) {
      return { passed: false, fixed: fixSummary, issues: recheckType.errors }
    }

    const customIssues = await this.runCustomRulesPhase(codeFiles)

    if (customIssues.length > 0) {
      return { passed: false, fixed: fixSummary, issues: customIssues }
    }

    if (this.config.fixers.eslint) {
      const recheckLint = await this.verifier.runLintCheck(codeFiles)

      if (!recheckLint.passed) {
        return { passed: false, fixed: fixSummary, issues: recheckLint.errors }
      }
    }

    return { passed: true, fixed: fixSummary, issues: [] }
  }
}
