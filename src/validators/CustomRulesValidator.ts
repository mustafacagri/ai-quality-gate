/**
 * Custom regex rules from config — scanned on lintable file contents (Phase 1).
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { formatCustomRuleId } from '@/constants/rules'
import type { CustomRule, Issue } from '@/types'

function compileRulePattern(pattern: string, ruleId: string): RegExp | null {
  try {
    return new RegExp(pattern, 'g')
  } catch {
    console.error(`[ai-quality-gate] Invalid custom rule pattern (skipped): id=${ruleId}, pattern=${pattern}`)

    return null
  }
}

interface RuleFileContext {
  rule: CustomRule
  normalizedFile: string
}

function pushMatchesOnLine(
  issues: Issue[],
  line: string,
  lineIndex0: number,
  regex: RegExp,
  ctx: RuleFileContext
): void {
  regex.lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(line)) !== null) {
    issues.push({
      rule: formatCustomRuleId(ctx.rule.id),
      file: ctx.normalizedFile,
      line: lineIndex0 + 1,
      column: match.index + 1,
      message: ctx.rule.message,
      severity: ctx.rule.severity
    })

    if (match[0].length === 0) {
      if (regex.lastIndex === match.index) regex.lastIndex += 1

      break
    }
  }
}

async function scanFileWithRule(rule: CustomRule, regex: RegExp, file: string): Promise<Issue[]> {
  let content: string

  try {
    content = await readFile(file, 'utf8')
  } catch (error) {
    console.error(`[ai-quality-gate] Could not read file for custom rules: ${file}`, error)

    return []
  }

  const lines = content.split(/\r?\n/)
  const normalizedPath = path.normalize(file)
  const ctx: RuleFileContext = { rule, normalizedFile: normalizedPath }
  const issues: Issue[] = []

  for (const [lineIndex, line] of lines.entries()) {
    pushMatchesOnLine(issues, line, lineIndex, regex, ctx)
  }

  return issues
}

export class CustomRulesValidator {
  async validate(rules: CustomRule[], files: string[]): Promise<Issue[]> {
    if (rules.length === 0 || files.length === 0) return []

    const issues: Issue[] = []

    for (const rule of rules) {
      const regex = compileRulePattern(rule.pattern, rule.id)

      if (regex === null) continue

      for (const file of files) {
        const fileIssues = await scanFileWithRule(rule, regex, file)

        issues.push(...fileIssues)
      }
    }

    return issues
  }
}
