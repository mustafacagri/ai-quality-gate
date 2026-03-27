/**
 * Verifier
 * Runs TypeScript typecheck and ESLint
 */

import { spawn } from 'node:child_process'
import path from 'node:path'
import * as fs from 'node:fs'
import type { Config, TypeCheckResult, LintResult, Issue, ESLintResult } from '@/types'
import { SEVERITY, isLintableFile, DEPRECATED_PATTERN, TYPESCRIPT_ERROR_PATTERN, RULE_NAMES } from '@/constants'
import {
  findProjectEslintConfigFile,
  groupFilesByTsConfig,
  isFileRelevantToPaths,
  resolveEmbeddedEslintConfigPath
} from '@/utils'

// ═══════════════════════════════════════════════════════════════════════════
// Security: Allowed Commands Whitelist
// Only these commands can be executed - prevents command injection
// ═══════════════════════════════════════════════════════════════════════════

const ALLOWED_COMMANDS = new Set(['npx', 'eslint', 'tsc', 'yarn', 'prettier'])

const validateCommand = (command: string): void => {
  // Allow known commands
  if (ALLOWED_COMMANDS.has(command)) return

  // Allow local node_modules/.bin binaries (safe - controlled by project)
  if (command.includes('node_modules') && command.includes('.bin')) return

  throw new Error(`Security: Command '${command}' is not in the allowed list`)
}

/**
 * Find local tsc binary in project's node_modules
 * Falls back to yarn tsc if not found
 */
const findTscCommand = (projectDir: string): { command: string; args: string[] } => {
  // Try local node_modules/.bin/tsc
  const localTsc = path.join(projectDir, 'node_modules', '.bin', 'tsc')
  const localTscWin = `${localTsc}.cmd`

  if (process.platform === 'win32' && fs.existsSync(localTscWin)) return { command: localTscWin, args: [] }

  if (fs.existsSync(localTsc)) return { command: localTsc, args: [] }

  // Fallback to yarn tsc (more reliable on Windows)
  return { command: 'yarn', args: ['tsc'] }
}

/**
 * Find ESLint binary - checks MCP package's node_modules first, then project's
 */
const findEslintCommand = (projectDir: string): { command: string; found: boolean } => {
  // First: Try MCP package's node_modules (ai-quality-gate/node_modules)
  const mcpPackageDir = path.join(projectDir, 'ai-quality-gate')
  const mcpEslint = path.join(mcpPackageDir, 'node_modules', '.bin', 'eslint')
  const mcpEslintWin = `${mcpEslint}.cmd`

  if (process.platform === 'win32' && fs.existsSync(mcpEslintWin)) return { command: mcpEslintWin, found: true }

  if (fs.existsSync(mcpEslint)) return { command: mcpEslint, found: true }

  // Second: Try project's node_modules
  const projectEslint = path.join(projectDir, 'node_modules', '.bin', 'eslint')
  const projectEslintWin = `${projectEslint}.cmd`

  if (process.platform === 'win32' && fs.existsSync(projectEslintWin)) return { command: projectEslintWin, found: true }

  if (fs.existsSync(projectEslint)) return { command: projectEslint, found: true }

  // Fallback to npx (may fail if not in PATH)
  return { command: 'npx', found: false }
}

/**
 * Find Prettier binary - checks project's node_modules
 */
const findPrettierCommand = (projectDir: string): { command: string; found: boolean } => {
  const projectPrettier = path.join(projectDir, 'node_modules', '.bin', 'prettier')
  const projectPrettierWin = `${projectPrettier}.cmd`

  if (process.platform === 'win32' && fs.existsSync(projectPrettierWin)) {
    return { command: projectPrettierWin, found: true }
  }

  if (fs.existsSync(projectPrettier)) return { command: projectPrettier, found: true }

  return { command: 'npx', found: false }
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

  /**
   * Prefer bundled strict config when present; otherwise root-level project ESLint config; else ESLint auto-discovery.
   */
  private resolveEslintCliConfigArgs(): string[] {
    if (fs.existsSync(this.embeddedEslintConfig)) return ['--config', this.embeddedEslintConfig]

    const projectConfig = findProjectEslintConfigFile(this.config.projectRoot)

    if (projectConfig !== undefined) return ['--config', projectConfig]

    return []
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
  private async runTypeCheckForGroup(tsConfigPath: string, groupFiles: string[]): Promise<Issue[]> {
    const projectDir = path.dirname(tsConfigPath)

    try {
      // Find tsc binary in project's node_modules or fallback to yarn
      const tscCmd = findTscCommand(projectDir)

      const result = await this.execCommand(
        tscCmd.command,
        [...tscCmd.args, '--noEmit', '--pretty', 'false', '--project', tsConfigPath],
        {
          cwd: projectDir,
          timeout: this.config.phase1Timeout
        }
      )

      // TypeScript outputs errors to stdout, not stderr
      // Note: Don't rely only on exit code - parse output for errors too
      // (Windows shell:true can sometimes misreport exit codes)
      // Also check for deprecated warnings (they're still errors in TS output)
      const output = result.stdout || result.stderr

      if (!result.success || TYPESCRIPT_ERROR_PATTERN.test(output) || DEPRECATED_PATTERN.test(output)) {
        return this.parseTypeCheckErrors(output, groupFiles)
      }

      return []
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)

      return [
        {
          rule: RULE_NAMES.TYPESCRIPT,
          file: tsConfigPath,
          line: 0,
          message: `TypeScript: typecheck could not run — ${detail}`,
          severity: SEVERITY.ERROR
        }
      ]
    }
  }

  /**
   * Run TypeScript type check on files
   * Groups files by tsconfig for accurate checking
   */
  async runTypeCheck(files: string[]): Promise<TypeCheckResult> {
    const tsFiles = files.filter(f => f.endsWith('.ts') || f.endsWith('.tsx'))

    if (tsFiles.length === 0) return { passed: true, errors: [] }

    const groups = groupFilesByTsConfig(tsFiles, this.config.projectRoot)
    const allErrors: Issue[] = []

    for (const [tsConfigPath, groupFiles] of groups) {
      if (tsConfigPath === '__no_tsconfig__') {
        allErrors.push(...this.reportMissingTsConfig(groupFiles))

        continue
      }

      const errors = await this.runTypeCheckForGroup(tsConfigPath, groupFiles)

      allErrors.push(...errors)
    }

    return {
      passed: allErrors.length === 0,
      errors: allErrors
    }
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
      const prettierCmd = findPrettierCommand(appDir)
      const args = prettierCmd.found ? ['--write', ...appFiles] : ['prettier', '--write', ...appFiles]

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
    const lintableFiles = files.filter(f => isLintableFile(f))

    if (lintableFiles.length === 0) return { passed: true, hasErrors: false, fixedCount: 0, errors: [] }

    const configArg = this.resolveEslintCliConfigArgs()

    // Find ESLint binary
    const eslintCmd = findEslintCommand(this.config.projectRoot)

    const fixArg = autoFix ? ['--fix'] : []

    // Build args based on whether we found local eslint or using npx
    const args = eslintCmd.found
      ? [...configArg, ...fixArg, '--format', 'json', ...lintableFiles]
      : ['eslint', ...configArg, ...fixArg, '--format', 'json', ...lintableFiles]

    try {
      const result = await this.execCommand(eslintCmd.command, args, {
        cwd: this.config.projectRoot,
        timeout: this.config.phase1Timeout
      })

      const output = result.stdout || '[]'

      return this.parseLintResult(output, lintableFiles)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)

      return {
        passed: false,
        hasErrors: true,
        fixedCount: 0,
        errors: [
          {
            rule: RULE_NAMES.ESLINT,
            file: this.config.projectRoot,
            line: 0,
            message: `ESLint: command failed — ${detail}`,
            severity: SEVERITY.ERROR
          }
        ]
      }
    }
  }

  private execCommand(
    command: string,
    args: string[],
    options: { cwd: string; timeout: number }
  ): Promise<{ success: boolean; stdout: string; stderr: string }> {
    // Security: Validate command against whitelist
    validateCommand(command)

    return new Promise(resolve => {
      // Security note: shell: true is required for Windows npx compatibility
      // Commands are validated against ALLOWED_COMMANDS whitelist
      // Args are controlled internally (not from user input)

      const proc = spawn(command, args, {
        cwd: options.cwd,
        shell: true,
        timeout: options.timeout
      })

      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (data: Buffer) => (stdout += data.toString()))

      proc.stderr.on('data', (data: Buffer) => (stderr += data.toString()))

      proc.on('close', code =>
        resolve({
          success: code === 0,
          stdout,
          stderr
        })
      )

      proc.on('error', error =>
        resolve({
          success: false,
          stdout,
          stderr: error.message
        })
      )
    })
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
      const results = JSON.parse(jsonOutput) as ESLintResult[]

      return this.processLintResults(results, relevantFiles)
    } catch (parseError) {
      return this.createParseErrorResult(parseError)
    }
  }

  private processLintResults(results: ESLintResult[], relevantFiles: string[]): LintResult {
    const errors: Issue[] = []
    let fixedCount = 0

    for (const result of results) {
      const isRelevant = isFileRelevantToPaths(result.filePath, relevantFiles)

      if (!isRelevant) continue

      if (result.output !== undefined) fixedCount++

      errors.push(...this.extractMessages(result))
    }

    return { passed: errors.length === 0, hasErrors: errors.length > 0, fixedCount, errors }
  }

  private extractMessages(result: ESLintResult): Issue[] {
    return result.messages
      .filter(msg => msg.severity >= 1)
      .map(msg => ({
        rule: msg.ruleId ?? RULE_NAMES.ESLINT,
        file: result.filePath,
        line: msg.line,
        column: msg.column,
        message: msg.message,
        severity: msg.severity === 2 ? SEVERITY.ERROR : SEVERITY.WARNING
      }))
  }

  private createParseErrorResult(error: unknown): LintResult {
    const detail = error instanceof Error ? error.message : String(error)

    return {
      passed: false,
      hasErrors: true,
      fixedCount: 0,
      errors: [
        {
          rule: RULE_NAMES.ESLINT,
          file: 'unknown',
          line: 0,
          message: `ESLint: could not parse JSON output — ${detail}`,
          severity: SEVERITY.ERROR
        }
      ]
    }
  }
}
