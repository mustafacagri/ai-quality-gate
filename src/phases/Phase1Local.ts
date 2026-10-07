/**
 * Phase 1: Local Analysis
 * Fast checks with ESLint + SonarJS + AST fixers + JSON validation
 * Always runs (~2-3 seconds)
 */

import type { Config, Issue, LocalResult, Transaction, FixSummary, Phase1RunOptions } from '@/types'
import { Verifier } from '@/core'
import { AutoFixer } from '@/fixers'
import { CustomRulesValidator, JsonValidator, type JsonValidationResult } from '@/validators'
import { isJsonFile, isLintableFile } from '@/constants/extensions'
import { CHECK_STATUS, VERIFICATION_ERROR_CODE } from '@/constants/verification'
import type { TypeCheckResult, LintResult } from '@/types/verification'
import { diagnoseVueFiles } from '@/vue/vueSfcDiagnostics'
import { emptyFixSummary } from '@/utils/fixSummary'

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
  private readonly jsonValidator: JsonValidator
  private readonly customRulesValidator: CustomRulesValidator

  constructor(config: Config) {
    this.config = config
    this.verifier = new Verifier(config)
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
    // Everything a run learns is kept in values that belong to the run, so runs on one instance cannot mix.
    const warnings: string[] = []
    const result = await this.runAnalysis(files, transaction, warnings, options)

    return warnings.length > 0 ? { ...result, warnings } : result
  }

  private async runAnalysis(
    files: string[],
    transaction: Transaction,
    warnings: string[],
    options?: Phase1RunOptions
  ): Promise<LocalResult> {
    const fixSummary = emptyFixSummary()
    const { jsonFiles, codeFiles } = this.categorizeFiles(files)
    const phase1Mode = options?.phase1Mode ?? 'fix'

    options?.onFixSummary?.(fixSummary)

    // Step 0: JSON Validation
    const jsonResult = await this.runJsonValidation(jsonFiles, fixSummary)

    if (jsonResult) return jsonResult

    // If no code files, return success
    if (codeFiles.length === 0) {
      return { passed: true, fixed: fixSummary, issues: [] }
    }

    if (phase1Mode === 'check') return this.runCodeAnalysisCheck(codeFiles, fixSummary, warnings)

    return this.runCodeAnalysis(codeFiles, transaction, fixSummary, warnings)
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
  private runCustomRulesPhase(codeFiles: string[], warnings: string[]): Promise<Issue[]> {
    const rules = this.config.customRules

    if (!rules?.length) return Promise.resolve([])

    return this.customRulesValidator.validate(rules, codeFiles, warnings)
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
    fixSummary: FixSummary,
    warnings: string[]
  ): Promise<LocalResult> {
    // Step 1: TypeScript Check
    const typecheck = await this.verifier.runTypeCheck(codeFiles)

    if (!typecheck.passed) {
      return this.verificationFailure(typecheck, fixSummary)
    }

    // An SFC the Vue compiler rejects cannot be edited safely. Custom rules and lint findings do not stop the fixers.
    const invalidVue = this.vueSfcFailure(codeFiles, fixSummary)

    if (invalidVue) return invalidVue

    this.ensureTransactionPrimedForMutablePhase(codeFiles, transaction)

    const fixerFailure = await this.applyFixers(codeFiles, transaction, fixSummary, warnings)

    if (fixerFailure) return fixerFailure

    return this.verifyAfterFixes(codeFiles, fixSummary, warnings)
  }

  private vueSfcFailure(codeFiles: string[], fixSummary: FixSummary): LocalResult | null {
    const issues = diagnoseVueFiles(codeFiles)

    if (issues.length === 0) return null

    return { passed: false, fixed: fixSummary, issues }
  }

  private async applyFixers(
    codeFiles: string[],
    transaction: Transaction,
    fixSummary: FixSummary,
    warnings: string[]
  ): Promise<LocalResult | null> {
    const { fixers } = this.config

    if (fixers.curlyBraces || fixers.singleLineArrow) {
      await this.runAstFixers(codeFiles, transaction, fixSummary, warnings)
    }

    if (fixers.eslint) {
      const lintFailure = await this.applyEslintFix(codeFiles, fixSummary)

      if (lintFailure) return lintFailure
    }

    const prettierFailure = await this.applyPrettier(codeFiles, fixSummary)

    if (prettierFailure) return prettierFailure

    if (fixers.eslint) return this.applyEslintFix(codeFiles, fixSummary)

    return null
  }

  /** ESLint failing to run (a parse error, a crash) means its output cannot be trusted, so it fails the run. */
  private async applyEslintFix(codeFiles: string[], fixSummary: FixSummary): Promise<LocalResult | null> {
    const lintFix = await this.verifier.runLintFix(codeFiles)

    fixSummary.eslint += lintFix.fixedCount

    if (lintFix.status === CHECK_STATUS.ERROR) return this.verificationFailure(lintFix, fixSummary)

    return null
  }

  private async applyPrettier(codeFiles: string[], fixSummary: FixSummary): Promise<LocalResult | null> {
    if (!this.config.fixers.prettier) return null

    const prettierResult = await this.verifier.runPrettier(codeFiles)
    fixSummary.prettier = prettierResult.formattedCount

    if (prettierResult.success) return null

    return { passed: false, fixed: fixSummary, issues: prettierResult.issues }
  }

  /**
   * Read-only Phase 1: typecheck + lint check only (no AST / ESLint --fix / Prettier writes).
   */
  private async runCodeAnalysisCheck(
    codeFiles: string[],
    fixSummary: FixSummary,
    warnings: string[]
  ): Promise<LocalResult> {
    const typecheck = await this.verifier.runTypeCheck(codeFiles)

    if (!typecheck.passed) {
      return { ...this.verificationFailure(typecheck, fixSummary), checks: { typecheck } }
    }

    const invalidVue = this.vueSfcFailure(codeFiles, fixSummary)

    if (invalidVue) return invalidVue

    return this.collectFindings(codeFiles, fixSummary, warnings, typecheck)
  }

  private verificationFailure(result: LintResult | TypeCheckResult, fixed: FixSummary): LocalResult {
    const response: LocalResult = { passed: false, fixed, issues: result.errors }

    if (result.status === CHECK_STATUS.ERROR) {
      response.phaseError = {
        code: 'fixedCount' in result ? VERIFICATION_ERROR_CODE.ESLINT : VERIFICATION_ERROR_CODE.TYPESCRIPT,
        message: result.errors.map(issue => issue.message).join('; ')
      }
    }

    return response
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
  private async runAstFixers(
    codeFiles: string[],
    transaction: Transaction,
    fixSummary: FixSummary,
    warnings: string[]
  ): Promise<void> {
    // The fixers keep what they skipped, so each run gets its own.
    const autoFixer = new AutoFixer(this.config.fixers)
    const astFixes = await autoFixer.scanAndFix(codeFiles, transaction)

    fixSummary.curlyBraces = astFixes.curlyBraces
    fixSummary.singleLineArrow = astFixes.singleLineArrow
    warnings.push(...autoFixer.drainSkipped())
  }

  /**
   * Re-verify after all fixes.
   * Type errors, an SFC the Vue compiler rejects, and ESLint failing to run mean the fixers broke the code, so the
   * run is rolled back. Lint findings and custom-rule matches are things the fixers could not fix: the edits stay
   * and the findings are reported.
   */
  private async verifyAfterFixes(
    codeFiles: string[],
    fixSummary: FixSummary,
    warnings: string[]
  ): Promise<LocalResult> {
    const recheckType = await this.verifier.runTypeCheck(codeFiles)

    if (!recheckType.passed) {
      return this.verificationFailure(recheckType, fixSummary)
    }

    const invalidVue = this.vueSfcFailure(codeFiles, fixSummary)

    if (invalidVue) return invalidVue

    return this.collectFindings(codeFiles, fixSummary, warnings)
  }

  /**
   * Lint findings and custom-rule matches, reported together. ESLint failing to run is not a finding: it is
   * returned as a failure that rolls the run back.
   */
  private async collectFindings(
    codeFiles: string[],
    fixSummary: FixSummary,
    warnings: string[],
    typecheck?: TypeCheckResult
  ): Promise<LocalResult> {
    const findings: Issue[] = []
    let lint: LintResult | undefined

    if (this.config.fixers.eslint) {
      lint = await this.verifier.runLintCheck(codeFiles)

      if (lint.status === CHECK_STATUS.ERROR) {
        return this.withChecks(this.verificationFailure(lint, fixSummary), typecheck, lint)
      }

      findings.push(...lint.errors)
    }

    findings.push(...(await this.runCustomRulesPhase(codeFiles, warnings)))

    if (findings.length === 0) return this.withChecks({ passed: true, fixed: fixSummary, issues: [] }, typecheck, lint)

    return this.withChecks({ passed: false, fixed: fixSummary, issues: findings, keepEdits: true }, typecheck, lint)
  }

  private withChecks(result: LocalResult, typecheck?: TypeCheckResult, lint?: LintResult): LocalResult {
    if (typecheck === undefined) return result

    return { ...result, checks: lint === undefined ? { typecheck } : { typecheck, lint } }
  }
}
