/**
 * Reading `tsc` / `vue-tsc` output (`file(line,col): error TS1234: message`) into issues.
 */

import path from 'node:path'

import { DEPRECATED_PATTERN, RULE_NAMES, SEVERITY, TYPESCRIPT_ERROR_PATTERN, UNKNOWN_ISSUE_LINE } from '@/constants'
import { EXIT_CODE } from '@/constants/exit-codes'
import { CHECK_STATUS } from '@/constants/verification'
import { assertCommandCompleted, type CommandResult } from '@/core/commandResult'
import type { Issue, TypeCheckResult } from '@/types'
import { isFileRelevantToPaths } from '@/utils'

/** More than this many diagnostics are cut off, so one broken project cannot flood a response. */
export const MAX_REPORTED_DIAGNOSTICS = 50

const DIAGNOSTIC_CODE_PREFIX = 'error TS'
const FILE_DIAGNOSTIC_MARKER = `): ${DIAGNOSTIC_CODE_PREFIX}`

const toIssue = (file: string, line: number, column: number | undefined, message: string): Issue => {
  const isDeprecated = DEPRECATED_PATTERN.test(message)

  return {
    rule: isDeprecated ? RULE_NAMES.TYPESCRIPT_DEPRECATED : RULE_NAMES.TYPESCRIPT,
    file,
    line,
    column,
    message,
    severity: isDeprecated ? SEVERITY.WARNING : SEVERITY.ERROR
  }
}

const isWholeNumber = (text: string | undefined): text is string => text !== undefined && /^\d+$/.test(text)

/** The text after `TS1234: ` in `error TS1234: message`, or undefined when the code is not a number. */
const messageAfterCode = (afterPrefix: string): string | undefined => {
  const colonAt = afterPrefix.indexOf(': ')

  return colonAt > 0 && isWholeNumber(afterPrefix.slice(0, colonAt)) ? afterPrefix.slice(colonAt + 2).trim() : undefined
}

/**
 * `file(line,col): error TS1234: message`. The file is found by the position that sits right before the marker,
 * so a path that has parentheses of its own, such as `app/(auth)/page.tsx`, still reads correctly. The checker
 * prints it relative to where it ran, so it is resolved against `baseDir`.
 */
const parseFileDiagnostic = (line: string, baseDir: string): Issue | null => {
  const markerAt = line.indexOf(FILE_DIAGNOSTIC_MARKER)
  const positionAt = markerAt === -1 ? -1 : line.lastIndexOf('(', markerAt)

  if (positionAt <= 0) return null

  const [lineText, columnText, ...extra] = line.slice(positionAt + 1, markerAt).split(',')
  const message = messageAfterCode(line.slice(markerAt + FILE_DIAGNOSTIC_MARKER.length))

  if (extra.length > 0 || !isWholeNumber(lineText) || !isWholeNumber(columnText) || message === undefined) return null

  const file = path.resolve(baseDir, path.normalize(line.slice(0, positionAt)))

  return toIssue(file, Number.parseInt(lineText, 10), Number.parseInt(columnText, 10), message)
}

/** A diagnostic about the program rather than a file: `error TS18003: No inputs were found in config file`. */
const parseGlobalDiagnostic = (line: string, configPath: string): Issue | null => {
  if (!line.startsWith(DIAGNOSTIC_CODE_PREFIX)) return null

  const message = messageAfterCode(line.slice(DIAGNOSTIC_CODE_PREFIX.length))

  return message === undefined ? null : toIssue(configPath, UNKNOWN_ISSUE_LINE, undefined, message)
}

/**
 * Parse a single line of checker output. Continuation lines of a multi-line message are indented and are not
 * diagnostics of their own.
 */
const parseDiagnosticLine = (line: string, configPath: string): Issue | null => {
  const trimmedLine = line.trim()

  return parseFileDiagnostic(trimmedLine, path.dirname(configPath)) ?? parseGlobalDiagnostic(trimmedLine, configPath)
}

/**
 * Every diagnostic the program has, those in the selected files first. The checker checks the whole program, and
 * an error in another file fails the check as much as one in a selected file, so none is dropped.
 */
const parseTypeCheckErrors = (output: string, relevantFiles: string[], configPath: string): Issue[] => {
  // Handle both Unix (\n) and Windows (\r\n) line endings
  const issues = output
    .split(/\r?\n/)
    .map(line => parseDiagnosticLine(line, configPath))
    .filter(issue => issue !== null)
  const selected = issues.filter(issue => isFileRelevantToPaths(issue.file, relevantFiles))
  const others = issues.filter(issue => !isFileRelevantToPaths(issue.file, relevantFiles))
  const ordered = [...selected, ...others]

  if (ordered.length <= MAX_REPORTED_DIAGNOSTICS) return ordered

  const hidden = ordered.length - MAX_REPORTED_DIAGNOSTICS
  const more = toIssue(
    configPath,
    UNKNOWN_ISSUE_LINE,
    undefined,
    `${String(hidden)} more TypeScript errors are not shown.`
  )

  return [...ordered.slice(0, MAX_REPORTED_DIAGNOSTICS), more]
}

/**
 * @param relevantFiles The selected files; their diagnostics come first.
 * @param configPath Where a diagnostic that belongs to no file is reported.
 * @throws Error when the process did not complete, or its output has nothing that reads as a diagnostic.
 */
export const parseTypeCheckCommand = (
  result: CommandResult,
  relevantFiles: string[],
  configPath: string
): TypeCheckResult => {
  const output = `${result.stdout}\n${result.stderr}`
  const errors = parseTypeCheckErrors(output, relevantFiles, configPath)

  assertCommandCompleted(result)

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

/** The same finding from two programs that both compile a file is one finding. */
export const sameDiagnostic = (left: Issue, right: Issue): boolean =>
  left.file === right.file &&
  left.line === right.line &&
  left.column === right.column &&
  left.rule === right.rule &&
  left.message === right.message
