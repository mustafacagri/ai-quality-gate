/**
 * Verifier
 * Runs TypeScript typecheck and ESLint
 */

import path from 'node:path'
import * as fs from 'node:fs'
import type { Config, TypeCheckResult, LintResult, Issue, PrettierFormatResult } from '@/types'
import { ESLintResultsSchema, type ESLintResult } from '@/types/eslint'
import { isLintableFile, isPrettierFormattableFile } from '@/constants/extensions'
import { CHECK_STATUS, PRETTIER_FLAG, VERIFIER_TOOL_MODULE, STRICT_LINT_ARGUMENTS } from '@/constants/verification'
import { PACKAGE_JSON } from '@/constants/project-root'
import { EXIT_CODE } from '@/constants/exit-codes'
import { SEVERITY, RULE_NAMES, UNKNOWN_ISSUE_LINE } from '@/constants'
import { resolveEmbeddedEslintConfigPath } from '@/utils'
import {
  assertCommandCompleted,
  commandFailureMessage,
  commandSucceeded,
  type CommandResult
} from '@/core/commandResult'
import { groupLintFilesByScriptLanguage, mergeLintResults, type LintGroup } from '@/core/lintGroups'
import { countChangedFiles, prettierFailureFile } from '@/core/prettierOutcome'
import { runProcess } from '@/core/runProcess'
import { findToolCommand } from '@/core/toolCommand'
import { toolIssue } from '@/core/toolIssue'
import { TypeChecker } from '@/core/TypeChecker'

// ═══════════════════════════════════════════════════════════════════════════
// Verifier Class
// ═══════════════════════════════════════════════════════════════════════════

export class Verifier {
  private readonly config: Config
  private readonly embeddedEslintConfig: string

  constructor(config: Config) {
    this.config = config
    this.embeddedEslintConfig = resolveEmbeddedEslintConfigPath()
  }

  private resolveEslintCliConfigArgs(): string[] {
    if (!fs.existsSync(this.embeddedEslintConfig)) throw new Error('Embedded ESLint config is missing')

    return ['--config', this.embeddedEslintConfig]
  }

  /**
   * Typecheck has full tsconfig context; lint remains limited to the selected paths.
   * See {@link TypeChecker}.
   */
  runTypeCheck(files: string[]): Promise<TypeCheckResult> {
    return new TypeChecker(this.config, (command, args, options) => this.execCommand(command, args, options)).run(files)
  }

  /**
   * Run ESLint with embedded config and auto-fix
   */
  runLintFix(files: string[]): Promise<LintResult> {
    return this.runLint(files, true)
  }

  /**
   * Run lint without fix (for verification)
   */
  runLintCheck(files: string[]): Promise<LintResult> {
    return this.runLint(files, false)
  }

  /**
   * Run Prettier to format files after ESLint fix
   * This ensures consistent formatting (e.g., single-line if statements)
   * Runs Prettier from each file's app directory to pick up correct config
   */
  async runPrettier(files: string[]): Promise<PrettierFormatResult> {
    const formattableFiles = [
      ...new Set(
        files.filter(file => isPrettierFormattableFile(file)).map(file => path.resolve(this.config.projectRoot, file))
      )
    ]

    if (formattableFiles.length === 0) return { success: true, formattedCount: 0, issues: [] }

    const filesByAppDir = this.groupFilesByAppDir(formattableFiles)
    let totalFormatted = 0
    const issues: Issue[] = []

    for (const [appDir, appFiles] of Object.entries(filesByAppDir)) {
      const formatted = await this.formatWithPrettier(appDir, appFiles)

      totalFormatted += formatted.formattedCount
      issues.push(...formatted.issues)
    }

    return { success: issues.length === 0, formattedCount: totalFormatted, issues }
  }

  /** A group that cannot be formatted reports an issue instead of throwing, so earlier groups keep their count. */
  private async formatWithPrettier(appDir: string, appFiles: string[]): Promise<PrettierFormatResult> {
    try {
      return await this.rewriteWithPrettier(appDir, appFiles)
    } catch (error) {
      return {
        success: false,
        formattedCount: 0,
        issues: [toolIssue(RULE_NAMES.PRETTIER, appFiles[0] ?? appDir, error)]
      }
    }
  }

  private async rewriteWithPrettier(appDir: string, appFiles: string[]): Promise<PrettierFormatResult> {
    const before = new Map<string, string>()

    for (const file of appFiles) before.set(path.resolve(file), fs.readFileSync(file, 'utf8'))

    const prettierCmd = findToolCommand(appDir, VERIFIER_TOOL_MODULE.PRETTIER)
    const args = [...prettierCmd.args, PRETTIER_FLAG.WRITE, PRETTIER_FLAG.NO_COLOR, ...appFiles]
    const result = await this.execCommand(prettierCmd.command, args, {
      cwd: appDir,
      timeout: this.config.phase1Timeout
    })

    // `prettier --write` rewrites the files it can format even when another file makes it exit non-zero.
    const formattedCount = countChangedFiles(appFiles, before)

    if (!commandSucceeded(result)) {
      const representative = prettierFailureFile(result, appDir, appFiles) ?? appDir

      return {
        success: false,
        formattedCount,
        issues: [
          {
            rule: RULE_NAMES.PRETTIER,
            file: representative,
            line: UNKNOWN_ISSUE_LINE,
            message: commandFailureMessage(result, 'Prettier'),
            severity: SEVERITY.ERROR
          }
        ]
      }
    }

    return { success: true, formattedCount, issues: [] }
  }

  /**
   * Group files by their app directory (api, admin, frontend, etc.)
   * Finds the nearest directory containing package.json
   */
  private groupFilesByAppDir(files: string[]): Record<string, string[]> {
    const result: Record<string, string[]> = {}

    for (const file of files) {
      const appDir = this.findAppDir(file)

      result[appDir] ??= []
      result[appDir].push(file)
    }

    return result
  }

  /**
   * Find the app directory for a file (nearest parent with package.json)
   */
  private findAppDir(filePath: string): string {
    let dir = path.dirname(filePath)

    while (dir !== path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, PACKAGE_JSON))) return dir

      dir = path.dirname(dir)
    }

    return this.config.projectRoot
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private Methods
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Core lint execution - DRY: shared between runLintFix and runLintCheck
   */
  private async runLint(files: string[], autoFix: boolean): Promise<LintResult> {
    const lintableFiles = [
      ...new Set(files.filter(isLintableFile).map(file => path.resolve(this.config.projectRoot, file)))
    ]

    if (lintableFiles.length === 0) {
      return { passed: true, status: CHECK_STATUS.PASS, scannedFiles: [], hasErrors: false, fixedCount: 0, errors: [] }
    }

    try {
      for (const file of lintableFiles) {
        if (!fs.statSync(file).isFile()) throw new Error(`Selected source is not a file: ${file}`)
      }
    } catch (error) {
      return this.createParseErrorResult(error)
    }

    const results: LintResult[] = []

    // Every group runs, so the edits an earlier `--fix` pass made are counted even if a later group fails.
    for (const group of groupLintFilesByScriptLanguage(lintableFiles)) {
      results.push(await this.runLintGroup(group, autoFix))
    }

    return mergeLintResults(results)
  }

  private async runLintGroup(group: LintGroup, autoFix: boolean): Promise<LintResult> {
    try {
      const eslintCmd = findToolCommand(this.config.projectRoot, VERIFIER_TOOL_MODULE.ESLINT)
      const args = [
        ...eslintCmd.args,
        ...this.resolveEslintCliConfigArgs(),
        ...(autoFix ? ['--fix'] : []),
        ...STRICT_LINT_ARGUMENTS,
        '--',
        ...group.files
      ]
      const result = await this.execCommand(eslintCmd.command, args, {
        cwd: this.config.projectRoot,
        timeout: this.config.phase1Timeout,
        env: group.env
      })

      return this.parseLintCommand(result, group.files)
    } catch (error) {
      return this.createParseErrorResult(error)
    }
  }

  private parseLintCommand(result: CommandResult, lintableFiles: string[]): LintResult {
    assertCommandCompleted(result)

    if (result.exitCode !== EXIT_CODE.SUCCESS && result.exitCode !== EXIT_CODE.QUALITY_FAILED) {
      throw new Error(`ESLint exit ${String(result.exitCode)}: ${result.stderr}`)
    }

    const parsed = this.parseLintResult(result.stdout, lintableFiles)

    if (result.exitCode === EXIT_CODE.QUALITY_FAILED && parsed.passed) {
      throw new Error('ESLint exited with findings but returned no accounted findings')
    }

    return parsed
  }

  private execCommand(
    command: string,
    args: string[],
    options: { cwd: string; timeout: number; env?: Record<string, string> }
  ): Promise<CommandResult> {
    if (command !== process.execPath) throw new Error('Verifier can only run Node tool entrypoints')

    return runProcess(command, args, options)
  }

  private parseLintResult(jsonOutput: string, relevantFiles: string[]): LintResult {
    let results: ESLintResult[]

    try {
      const raw: unknown = JSON.parse(jsonOutput)
      results = ESLintResultsSchema.parse(raw)
    } catch (parseError) {
      return this.createParseErrorResult(parseError)
    }

    try {
      return this.processLintResults(results, relevantFiles)
    } catch (processError) {
      // `eslint --fix` has already written the files it could fix, whatever happened to the others.
      return this.createParseErrorResult(processError, results.filter(result => result.output !== undefined).length)
    }
  }

  private processLintResults(results: ESLintResult[], relevantFiles: string[]): LintResult {
    const errors: Issue[] = []
    let fixedCount = 0
    const expected = new Set(relevantFiles.map(file => path.normalize(file)))
    const scanned = new Set<string>()

    for (const result of results) {
      const file = path.normalize(result.filePath)

      if (!expected.has(file) || scanned.has(file)) throw new Error(`Unaccounted or duplicate ESLint path: ${file}`)

      scanned.add(file)

      if (result.messages.some(message => message.fatal === true)) {
        throw new Error(`ESLint parser error in ${file}: ${result.messages.map(message => message.message).join('; ')}`)
      }

      if (result.output !== undefined) fixedCount++

      errors.push(...this.extractMessages(result))
    }

    if (scanned.size !== expected.size) throw new Error('ESLint did not account for every selected file')

    return {
      passed: errors.length === 0,
      status: errors.length === 0 ? CHECK_STATUS.PASS : CHECK_STATUS.FAIL,
      scannedFiles: [...scanned],
      hasErrors: errors.length > 0,
      fixedCount,
      errors
    }
  }

  private extractMessages(result: ESLintResult): Issue[] {
    return result.messages
      .filter(msg => msg.severity >= 1)
      .map(msg => ({
        rule: msg.ruleId ?? RULE_NAMES.ESLINT,
        file: result.filePath,
        line: msg.line ?? 0,
        column: msg.column,
        message: msg.message,
        severity: msg.severity === 2 ? SEVERITY.ERROR : SEVERITY.WARNING
      }))
  }

  private createParseErrorResult(error: unknown, fixedCount = 0): LintResult {
    return {
      passed: false,
      status: CHECK_STATUS.ERROR,
      scannedFiles: [],
      hasErrors: true,
      fixedCount,
      errors: [toolIssue(RULE_NAMES.ESLINT, this.config.projectRoot, error)]
    }
  }
}
