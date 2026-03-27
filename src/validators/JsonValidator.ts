/**
 * 🔍 JSON Validator - Principal Level Implementation
 *
 * Provides comprehensive JSON validation:
 * 1. Syntax validation (parseable JSON)
 * 2. Encoding validation (valid UTF-8)
 * 3. i18n consistency checking (same keys across locales) — reported in `i18nIssues` only; does not set `passed`
 * 4. Duplicate key detection (engine-dependent; surfaced via parse messages when applicable)
 *
 * @example
 * const validator = new JsonValidator()
 * const result = await validator.validate(files)
 */

import * as fs from 'node:fs/promises'
import path from 'node:path'
import type { Issue } from '@/types'
import { isI18nLocaleFile } from '@/constants'

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

/** UTF-8 BOM character code point (U+FEFF = 65279 decimal) */
const BOM_CODE_POINT = 65_279

/** Minimum locale files needed for consistency check */
const MIN_LOCALE_FILES_FOR_CONSISTENCY = 2

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

/** Per-file JSON parse/BOM issues determine {@link JsonValidationResult.passed}; i18n key drift does not. */
export interface JsonValidationResult {
  /** `true` only when there are no {@link issues} (syntax/BOM). Ignores {@link i18nIssues}. */
  passed: boolean
  validCount: number
  issues: Issue[]
  /** Extra/missing keys across locale files; informational — does not affect {@link passed}. */
  i18nIssues: I18nIssue[]
}

export interface I18nIssue {
  file: string
  type: 'extra_key' | 'missing_key'
  key: string
  referenceFile: string
}

interface JsonParseError {
  file: string
  line: number
  column: number
  message: string
}

interface SingleFileResult {
  passed: boolean
  error?: JsonParseError
}

// ═══════════════════════════════════════════════════════════════════════════
// JSON Validator
// ═══════════════════════════════════════════════════════════════════════════

export class JsonValidator {
  /**
   * Validate JSON files
   *
   * @param files - Array of file paths to validate
   * @returns Validation result. `passed` reflects blocking issues only (`issues`). Locale key consistency
   *   is listed separately in `i18nIssues` and does not flip `passed` to `false`.
   */
  async validate(files: string[]): Promise<JsonValidationResult> {
    const issues: Issue[] = []
    const i18nIssues: I18nIssue[] = []
    let validCount = 0

    // Group i18n files by directory for consistency checking
    const i18nGroups = new Map<string, string[]>()

    for (const file of files) {
      const result = await this.validateSingleFile(file)

      if (result.passed) {
        validCount++
        this.trackI18nFile(file, i18nGroups)
      } else if (result.error) issues.push(this.toIssue(result.error))
    }

    // Check i18n consistency for each group
    const consistencyIssues = await this.checkAllI18nGroups(i18nGroups)
    i18nIssues.push(...consistencyIssues)

    return {
      passed: issues.length === 0,
      validCount,
      issues,
      i18nIssues
    }
  }

  /**
   * Track i18n file for consistency checking
   */
  private trackI18nFile(file: string, groups: Map<string, string[]>): void {
    if (!isI18nLocaleFile(file)) return

    const dir = path.dirname(file)
    const group = groups.get(dir) ?? []
    group.push(file)
    groups.set(dir, group)
  }

  /**
   * Check i18n consistency for all groups
   */
  private async checkAllI18nGroups(groups: Map<string, string[]>): Promise<I18nIssue[]> {
    const allIssues: I18nIssue[] = []

    for (const [, localeFiles] of groups) {
      if (localeFiles.length >= MIN_LOCALE_FILES_FOR_CONSISTENCY) {
        const issues = await this.checkI18nConsistency(localeFiles)
        allIssues.push(...issues)
      }
    }

    return allIssues
  }

  /**
   * Validate a single JSON file
   */
  private async validateSingleFile(filePath: string): Promise<SingleFileResult> {
    try {
      const content = await fs.readFile(filePath, 'utf8')

      // Check for BOM (Byte Order Mark) - common encoding issue
      if (this.hasBom(content)) {
        return {
          passed: false,
          error: {
            file: filePath,
            line: 1,
            column: 1,
            message: 'File contains BOM (Byte Order Mark). Remove it for clean JSON.'
          }
        }
      }

      // Try to parse with detailed error extraction
      this.parseJson(content)

      return { passed: true }
    } catch (error) {
      return {
        passed: false,
        error: this.extractParseError(error, filePath)
      }
    }
  }

  /**
   * Check if content has BOM
   */
  private hasBom(content: string): boolean {
    return content.codePointAt(0) === BOM_CODE_POINT
  }

  /**
   * Parse JSON content
   */
  private parseJson(content: string): unknown {
    return JSON.parse(content) as unknown
  }

  /**
   * Extract detailed error information from JSON parse error
   */
  private extractParseError(error: unknown, filePath: string): JsonParseError {
    const message = error instanceof Error ? error.message : String(error)
    const { line, column } = this.extractLineColumn(message)

    return {
      file: filePath,
      line,
      column,
      message: this.friendlyErrorMessage(message)
    }
  }

  /**
   * Extract line and column from error message
   */
  private extractLineColumn(message: string): { line: number; column: number } {
    let line = 1
    let column = 1

    // Try to extract position from error message
    const positionMatch = /at position (\d+)/.exec(message)

    if (positionMatch?.[1]) column = Number.parseInt(positionMatch[1], 10)

    // Try to extract line number from newer Node.js format
    const lineMatch = /line (\d+)/.exec(message)
    const columnMatch = /column (\d+)/.exec(message)

    if (lineMatch?.[1]) line = Number.parseInt(lineMatch[1], 10)
    if (columnMatch?.[1]) column = Number.parseInt(columnMatch[1], 10)

    return { line, column }
  }

  /**
   * Convert JSON parse error to user-friendly message
   */
  private friendlyErrorMessage(message: string): string {
    if (message.includes('Unexpected token')) return this.friendlyUnexpectedTokenMessage(message)

    if (message.includes('Unexpected end')) return 'Incomplete JSON - missing closing bracket or brace'

    if (message.includes('Duplicate keys')) return message

    return `JSON parse error: ${message}`
  }

  /**
   * Get friendly message for unexpected token errors
   */
  private friendlyUnexpectedTokenMessage(message: string): string {
    if (message.includes(',')) return 'Trailing comma or extra comma in JSON (not allowed in strict JSON)'
    if (message.includes('}')) return 'Unexpected closing brace - check for missing values or extra commas'
    if (message.includes(']')) return 'Unexpected closing bracket - check for missing values or extra commas'

    return 'Invalid JSON syntax - check for typos or missing quotes'
  }

  /**
   * Check i18n consistency across locale files
   * Ensures all locale files have the same keys
   */
  private async checkI18nConsistency(localeFiles: string[]): Promise<I18nIssue[]> {
    const localeData = await this.parseLocaleFiles(localeFiles)

    if (localeData.size < MIN_LOCALE_FILES_FOR_CONSISTENCY) return []

    return this.compareLocaleKeys(localeData)
  }

  /**
   * Parse all locale files and extract keys
   */
  private async parseLocaleFiles(localeFiles: string[]): Promise<Map<string, Set<string>>> {
    const localeData = new Map<string, Set<string>>()

    for (const file of localeFiles) {
      const keys = await this.extractKeysFromFile(file)

      if (keys) localeData.set(file, keys)
    }

    return localeData
  }

  /**
   * Extract keys from a single locale file
   */
  private async extractKeysFromFile(file: string): Promise<Set<string> | null> {
    try {
      const content = await fs.readFile(file, 'utf8')
      const parsed = JSON.parse(content) as Record<string, unknown>
      const keys = this.extractAllKeys(parsed)

      return new Set(keys)
    } catch {
      // Skip files that failed to parse (already reported as issues)
      return null
    }
  }

  /**
   * Compare keys across all locale files
   */
  private compareLocaleKeys(localeData: Map<string, Set<string>>): I18nIssue[] {
    const entries: [string, Set<string>][] = [...localeData.entries()]
    const firstEntry = entries[0]

    if (!firstEntry) return []

    const [referenceFile, referenceKeys] = firstEntry

    const issues: I18nIssue[] = []

    for (const [file, keys] of entries.slice(1)) {
      const missingKeys = this.findMissingKeys(file, keys, referenceFile, referenceKeys)
      const extraKeys = this.findExtraKeys(file, keys, referenceFile, referenceKeys)
      issues.push(...missingKeys, ...extraKeys)
    }

    return issues
  }

  /**
   * Find keys missing in target file
   */
  private findMissingKeys(
    file: string,
    keys: Set<string>,
    referenceFile: string,
    referenceKeys: Set<string>
  ): I18nIssue[] {
    const issues: I18nIssue[] = []

    for (const key of referenceKeys) {
      if (!keys.has(key)) issues.push({ file, type: 'missing_key', key, referenceFile })
    }

    return issues
  }

  /**
   * Find extra keys in target file
   */
  private findExtraKeys(
    file: string,
    keys: Set<string>,
    referenceFile: string,
    referenceKeys: Set<string>
  ): I18nIssue[] {
    const issues: I18nIssue[] = []

    for (const key of keys) {
      if (!referenceKeys.has(key)) issues.push({ file, type: 'extra_key', key, referenceFile })
    }

    return issues
  }

  /**
   * Extract all keys from nested object (dot notation)
   */
  private extractAllKeys(obj: Record<string, unknown>, prefix = ''): string[] {
    const keys: string[] = []

    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key

      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        keys.push(...this.extractAllKeys(value as Record<string, unknown>, fullKey))
      } else {
        keys.push(fullKey)
      }
    }

    return keys
  }

  /**
   * Convert JsonParseError to Issue format
   */
  private toIssue(error: JsonParseError): Issue {
    return {
      rule: 'json/parse-error',
      file: error.file,
      line: error.line,
      column: error.column,
      message: error.message,
      severity: 'error'
    }
  }
}
