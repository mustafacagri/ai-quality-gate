/**
 * Structural Vue SFC diagnostics.
 * `parse()` reports template and tag errors. `compileScript()` reports script combinations
 * ESLint accepts and Vue rejects, such as exports inside `<script setup>` or mixed languages.
 */

import fs from 'node:fs'

import {
  compileScript,
  invalidateTypeCache,
  parse,
  registerTS,
  type CompilerError,
  type SFCDescriptor,
  type SFCScriptCompileOptions
} from '@vue/compiler-sfc'
import * as ts from 'typescript'

import { isVueSfc } from '@/constants/extensions'
import { RULE_NAMES, SEVERITY, UNKNOWN_ISSUE_LINE } from '@/constants'
import type { Issue } from '@/types'
import { errorMessage } from '@/utils/errorMessage'

const isCompilerError = (error: CompilerError | SyntaxError): error is CompilerError => 'loc' in error

const firstLine = (value: string): string => {
  const breakAt = value.indexOf('\n')

  if (breakAt === -1) return value

  return value.slice(0, breakAt)
}

const messageFrom = (error: unknown): string => firstLine(errorMessage(error))

const issueAt = (filePath: string, line: number, message: string, column?: number): Issue => {
  const issue: Issue = {
    rule: RULE_NAMES.VUE_SFC,
    file: filePath,
    line,
    message,
    severity: SEVERITY.ERROR
  }

  if (column !== undefined) issue.column = column

  return issue
}

const issueFromParseError = (filePath: string, error: CompilerError | SyntaxError): Issue => {
  if (!isCompilerError(error) || error.loc === undefined) return issueAt(filePath, UNKNOWN_ISSUE_LINE, error.message)

  return issueAt(filePath, error.loc.start.line, error.message, error.loc.start.column)
}

let typeScriptRegistered = false

/**
 * `compileScript()` resolves types that `defineProps<Props>()` imports from another file through TypeScript.
 * It does not load TypeScript itself outside a bundler plugin, and reports a missing file system instead.
 */
const registerTypeScriptOnce = (): void => {
  if (typeScriptRegistered) return

  registerTS(() => ts)
  typeScriptRegistered = true
}

type CompilerFileSystem = NonNullable<SFCScriptCompileOptions['fs']>

/**
 * `compileScript()` caches every type file it reads, by name, and never reads it again. A bundler plugin drops
 * entries when the watcher reports a change. This process outlives many edits and has no watcher, so every file
 * a call reads is recorded here and dropped afterwards.
 */
const trackReads = (readFiles: Set<string>): CompilerFileSystem => ({
  fileExists: file => ts.sys.fileExists(file),
  readFile: file => {
    readFiles.add(file)

    return ts.sys.readFile(file)
  },
  realpath: file => ts.sys.realpath?.(file) ?? file
})

const compileScriptIssues = (filePath: string, descriptor: SFCDescriptor): Issue[] => {
  if (descriptor.script === null && descriptor.scriptSetup === null) return []

  registerTypeScriptOnce()

  const readFiles = new Set<string>()

  try {
    compileScript(descriptor, { id: filePath, sourceMap: false, fs: trackReads(readFiles) })

    return []
  } catch (error) {
    return [issueAt(filePath, UNKNOWN_ISSUE_LINE, messageFrom(error))]
  } finally {
    for (const file of readFiles) invalidateTypeCache(file)

    invalidateTypeCache(filePath)
  }
}

export const diagnoseVueSource = (filePath: string, source: string): Issue[] => {
  try {
    const parsed = parse(source, { filename: filePath, sourceMap: false })
    const parseIssues = parsed.errors.map(error => issueFromParseError(filePath, error))

    if (parseIssues.length > 0) return parseIssues

    return compileScriptIssues(filePath, parsed.descriptor)
  } catch (error) {
    return [issueAt(filePath, UNKNOWN_ISSUE_LINE, messageFrom(error))]
  }
}

/** A file that cannot be read is a finding, not a crash: the caller named a path that is not there. */
const diagnoseVueFile = (filePath: string): Issue[] => {
  let source: string

  try {
    source = fs.readFileSync(filePath, 'utf8')
  } catch (error) {
    return [issueAt(filePath, UNKNOWN_ISSUE_LINE, `Could not read the file: ${messageFrom(error)}`)]
  }

  return diagnoseVueSource(filePath, source)
}

export const diagnoseVueFiles = (filePaths: readonly string[]): Issue[] => {
  const issues: Issue[] = []

  for (const filePath of filePaths) {
    if (!isVueSfc(filePath)) continue

    issues.push(...diagnoseVueFile(filePath))
  }

  return issues
}
