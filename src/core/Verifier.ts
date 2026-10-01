/**
 * Verifier
 * Runs TypeScript typecheck and ESLint
 */

import { spawn } from 'node:child_process'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import * as fs from 'node:fs'
import type { Config, TypeCheckResult, LintResult, Issue } from '@/types'
import { ESLintResultsSchema, type ESLintResult } from '@/types/eslint'
import { isLintableFile, isTypeScriptFile } from '@/constants/extensions'
import {
  CHECK_STATUS,
  VERIFIER_TOOL_MODULE,
  STRICT_LINT_ARGUMENTS,
  TYPECHECK_CACHE_PREFIX,
  TYPECHECK_CACHE_FILENAME
} from '@/constants/verification'
import { EXIT_CODE } from '@/constants/exit-codes'
import { SEVERITY, DEPRECATED_PATTERN, TYPESCRIPT_ERROR_PATTERN, RULE_NAMES } from '@/constants'
import { groupFilesByTsConfig, isFileRelevantToPaths, resolveEmbeddedEslintConfigPath } from '@/utils'

// ═══════════════════════════════════════════════════════════════════════════
// Security: Node Tool Entrypoints
// No shell interpolation of selected source paths
// ═══════════════════════════════════════════════════════════════════════════

interface CommandResult {
  exitCode: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  error?: string
}

const packageRequire = createRequire(import.meta.url)

/** Execute JS tool entrypoints with Node directly, including on Windows; never interpolate file paths in a shell. */
const findToolCommand = (
  projectDir: string,
  tool: (typeof VERIFIER_TOOL_MODULE)[keyof typeof VERIFIER_TOOL_MODULE]
): { command: string; args: string[] } => {
  const projectRequire = createRequire(path.join(projectDir, 'package.json'))
  let packagePath: string

  try {
    packagePath =
      tool === VERIFIER_TOOL_MODULE.ESLINT ? packageRequire.resolve(tool.package) : projectRequire.resolve(tool.package)
  } catch {
    packagePath = packageRequire.resolve(tool.package)
  }

  return { command: process.execPath, args: [path.join(path.dirname(packagePath), tool.binary)] }
}

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
   * Report files without tsconfig as errors
   */
  private reportMissingTsConfig(groupFiles: string[]): Issue[] {
    return groupFiles.map(file => ({
      rule: RULE_NAMES.TYPESCRIPT,
      file,
      line: 0,
      message: 'No tsconfig.json found for this file',
      severity: SEVERITY.ERROR
    }))
  }

  /**
   * Run TypeScript typecheck for a single tsconfig group
   */
  private async runTypeCheckForGroup(tsConfigPath: string, groupFiles: string[]): Promise<TypeCheckResult> {
    const projectDir = path.dirname(tsConfigPath)
    let cacheDir: string | undefined

    try {
      cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), TYPECHECK_CACHE_PREFIX))
      const tscCmd = findToolCommand(projectDir, VERIFIER_TOOL_MODULE.TYPESCRIPT)
      const result = await this.execCommand(
        tscCmd.command,
        [
          ...tscCmd.args,
          '--noEmit',
          '--incremental',
          '--tsBuildInfoFile',
          path.join(cacheDir, TYPECHECK_CACHE_FILENAME),
          '--pretty',
          'false',
          '--project',
          tsConfigPath
        ],
        { cwd: projectDir, timeout: this.config.phase1Timeout }
      )

      return this.parseTypeCheckCommand(result, groupFiles)
    } catch (error) {
      return {
        passed: false,
        status: CHECK_STATUS.ERROR,
        errors: [this.toolIssue(RULE_NAMES.TYPESCRIPT, tsConfigPath, error)]
      }
    } finally {
      if (cacheDir !== undefined) fs.rmSync(cacheDir, { recursive: true, force: true })
    }
  }

  private parseTypeCheckCommand(result: CommandResult, groupFiles: string[]): TypeCheckResult {
    const output = `${result.stdout}\n${result.stderr}`
    const errors = this.parseTypeCheckErrors(output, groupFiles)
    this.assertCommandCompleted(result)

    if (output.trim().length > 0 && errors.length === 0) {
      throw new Error(`Unaccounted TypeScript output: ${output.trim()}`)
    }

    const failed =
      result.exitCode !== EXIT_CODE.SUCCESS || TYPESCRIPT_ERROR_PATTERN.test(output) || DEPRECATED_PATTERN.test(output)

    if (failed && errors.length === 0) {
      throw new Error(`TypeScript failed without accounted diagnostics: ${output.trim()}`)
    }

    return {
      passed: !failed && errors.length === 0,
      status: failed || errors.length > 0 ? CHECK_STATUS.FAIL : CHECK_STATUS.PASS,
      errors
    }
  }

  private assertCommandCompleted(result: CommandResult): void {
    if (result.error !== undefined || result.signal !== null || result.exitCode === null) {
      throw new Error(
        result.error ?? `exit ${String(result.exitCode)}, signal ${String(result.signal)}: ${result.stderr}`
      )
    }
  }

  /** Typecheck has full tsconfig context; lint remains limited to the selected paths. */
  async runTypeCheck(files: string[]): Promise<TypeCheckResult> {
    const tsFiles = files.filter(isTypeScriptFile).map(file => path.resolve(this.config.projectRoot, file))
    const missing = tsFiles.filter(file => !fs.existsSync(file) || !fs.statSync(file).isFile())

    if (missing.length > 0) {
      return {
        passed: false,
        status: CHECK_STATUS.ERROR,
        errors: missing.map(file =>
          this.toolIssue(RULE_NAMES.TYPESCRIPT, file, new Error('Selected TypeScript source is missing'))
        )
      }
    }

    const groups = groupFilesByTsConfig(tsFiles, this.config.projectRoot)
    const allErrors: Issue[] = []
    let status: TypeCheckResult['status'] = CHECK_STATUS.PASS

    for (const [tsConfigPath, groupFiles] of groups) {
      if (tsConfigPath === '__no_tsconfig__') {
        allErrors.push(...this.reportMissingTsConfig(groupFiles))
        status = CHECK_STATUS.ERROR
        continue
      }

      const result = await this.runTypeCheckForGroup(tsConfigPath, groupFiles)
      allErrors.push(...result.errors)

      if (
        result.status === CHECK_STATUS.ERROR ||
        (status !== CHECK_STATUS.ERROR && result.status === CHECK_STATUS.FAIL)
      ) {
        const { status: resultStatus } = result
        status = resultStatus
      }
    }

    return { passed: status === CHECK_STATUS.PASS, status, errors: allErrors, checkedProjects: [...groups.keys()] }
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
  async runPrettier(files: string[]): Promise<{ success: boolean; formattedCount: number }> {
    const formattableFiles = files.filter(f => /\.(?:ts|tsx|js|jsx|vue|json)$/.test(f))

    if (formattableFiles.length === 0) return { success: true, formattedCount: 0 }

    // Group files by their app directory to run Prettier with correct config
    const filesByAppDir = this.groupFilesByAppDir(formattableFiles)
    let totalFormatted = 0

    for (const [appDir, appFiles] of Object.entries(filesByAppDir)) {
      const prettierCmd = findToolCommand(appDir, VERIFIER_TOOL_MODULE.PRETTIER)
      const args = [...prettierCmd.args, '--write', ...appFiles]

      try {
        await this.execCommand(prettierCmd.command, args, {
          cwd: appDir,
          timeout: this.config.phase1Timeout
        })

        totalFormatted += appFiles.length
      } catch {
        // Prettier failure is not critical - continue with other files
      }
    }

    return { success: totalFormatted > 0, formattedCount: totalFormatted }
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
      if (fs.existsSync(path.join(dir, 'package.json'))) return dir

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

      const eslintCmd = findToolCommand(this.config.projectRoot, VERIFIER_TOOL_MODULE.ESLINT)
      const args = [
        ...eslintCmd.args,
        ...this.resolveEslintCliConfigArgs(),
        ...(autoFix ? ['--fix'] : []),
        ...STRICT_LINT_ARGUMENTS,
        '--',
        ...lintableFiles
      ]
      const result = await this.execCommand(eslintCmd.command, args, {
        cwd: this.config.projectRoot,
        timeout: this.config.phase1Timeout
      })

      return this.parseLintCommand(result, lintableFiles)
    } catch (error) {
      return this.createParseErrorResult(error)
    }
  }

  private parseLintCommand(result: CommandResult, lintableFiles: string[]): LintResult {
    this.assertCommandCompleted(result)

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
    options: { cwd: string; timeout: number }
  ): Promise<CommandResult> {
    if (command !== process.execPath) throw new Error('Verifier can only run Node tool entrypoints')

    return new Promise(resolve => {
      const proc = spawn(command, args, { cwd: options.cwd, shell: false, timeout: options.timeout })
      let stdout = ''
      let stderr = ''
      proc.stdout.on('data', (data: Buffer) => (stdout += data.toString()))
      proc.stderr.on('data', (data: Buffer) => (stderr += data.toString()))
      proc.on('close', (exitCode, signal) => resolve({ exitCode, signal, stdout, stderr }))
      proc.on('error', error => resolve({ exitCode: null, signal: null, stdout, stderr, error: error.message }))
    })
  }

  private toolIssue(rule: string, file: string, error: unknown): Issue {
    const detail = error instanceof Error ? error.message : String(error)

    return { rule, file, line: 0, message: `Check execution error: ${detail}`, severity: SEVERITY.ERROR }
  }

  /**
   * Parse a single TypeScript error line into an Issue
   */
  private parseErrorLine(line: string, relevantFiles: string[]): Issue | null {
    const trimmedLine = line.trim()
    // TypeScript error format: file(line,col): error TS####: message
    // Also captures deprecated warnings: file(line,col): error TS####: ... is deprecated
    // ReDoS-safe: Use non-greedy [^(]+ instead of .+, fixed spaces instead of \s*
    const errorRegex = /^([^(]+)\((\d+),(\d+)\): error TS\d+: (.+)$/
    const match = errorRegex.exec(trimmedLine)

    if (!match) return null

    const [, file, lineNum, col, message] = match

    if (!file || !lineNum || !message) return null

    const normalizedFile = path.normalize(file)

    if (!isFileRelevantToPaths(normalizedFile, relevantFiles)) return null

    const trimmedMessage = message.trim()
    const isDeprecated = DEPRECATED_PATTERN.test(trimmedMessage)

    return {
      rule: isDeprecated ? RULE_NAMES.TYPESCRIPT_DEPRECATED : RULE_NAMES.TYPESCRIPT,
      file: normalizedFile,
      line: Number.parseInt(lineNum, 10),
      column: col ? Number.parseInt(col, 10) : undefined,
      message: trimmedMessage,
      severity: isDeprecated ? SEVERITY.WARNING : SEVERITY.ERROR
    }
  }

  private parseTypeCheckErrors(output: string, relevantFiles: string[]): Issue[] {
    const errors: Issue[] = []
    // Handle both Unix (\n) and Windows (\r\n) line endings
    const lines = output.split(/\r?\n/)

    for (const line of lines) {
      const issue = this.parseErrorLine(line, relevantFiles)

      if (issue) errors.push(issue)
    }

    return errors
  }

  private parseLintResult(jsonOutput: string, relevantFiles: string[]): LintResult {
    try {
      const raw: unknown = JSON.parse(jsonOutput)
      const results = ESLintResultsSchema.parse(raw)

      return this.processLintResults(results, relevantFiles)
    } catch (parseError) {
      return this.createParseErrorResult(parseError)
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

  private createParseErrorResult(error: unknown): LintResult {
    return {
      passed: false,
      status: CHECK_STATUS.ERROR,
      scannedFiles: [],
      hasErrors: true,
      fixedCount: 0,
      errors: [this.toolIssue(RULE_NAMES.ESLINT, this.config.projectRoot, error)]
    }
  }
}
