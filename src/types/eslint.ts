/**
 * ESLint Types - Internal types for parsing ESLint output
 */

export interface ESLintResult {
  filePath: string
  messages: ESLintMessage[]
  output?: string
}

export interface ESLintMessage {
  ruleId: string | null
  severity: number
  message: string
  line: number
  column: number
}
