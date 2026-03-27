/**
 * Curly Braces Fixer - Removes unnecessary braces from single-statement if blocks
 *
 * Converts:
 *   if (condition) {
 *     return value
 *   }
 *
 * To:
 *   if (condition) return value
 *
 * Rules:
 * - Body must be single statement
 * - Combined line must be < MAX_LINE_LENGTH characters
 * - No else clause
 * - No comments inside body
 */

import { SyntaxKind, type SourceFile, type IfStatement, type Block } from 'ts-morph'
import type { Fix, Transaction, TransformResult } from '@/types'
import { FIXER_TYPE } from '@/constants'
import { BaseFixer } from '@/fixers/BaseFixer'

const MAX_LINE_LENGTH = 120

export class CurlyBracesFixer extends BaseFixer {
  readonly name = FIXER_TYPE.CURLY_BRACES

  /**
   * Scan file for if statements with unnecessary braces
   */
  async scanAndFix(filePath: string, transaction: Transaction): Promise<Fix[]> {
    const fixes: Fix[] = []

    try {
      const sourceFile = this.getSourceFile(filePath)
      const ifStatements = this.findIfStatements(sourceFile)
      // Sort in reverse order (end to start) so replacements don't affect positions
      const sortedStatements = [...ifStatements].sort((a, b) => b.getStart() - a.getStart())

      for (const ifStmt of sortedStatements) {
        if (!this.isSafeToTransform(ifStmt)) continue

        const lineNumber = ifStmt.getStartLineNumber()
        transaction.recordChange(filePath)

        const result = this.transform(ifStmt)

        if (result.success) {
          fixes.push({
            file: filePath,
            line: lineNumber,
            type: FIXER_TYPE.CURLY_BRACES,
            description: 'Removed unnecessary curly braces from single-statement if'
          })
        }
      }

      if (fixes.length > 0) await sourceFile.save()

      this.cleanupSourceFile(sourceFile)
    } catch (error) {
      console.error(`CurlyBracesFixer error in ${filePath}:`, error)
    }

    return fixes
  }

  private findIfStatements(sourceFile: SourceFile): IfStatement[] {
    return sourceFile.getDescendantsOfKind(SyntaxKind.IfStatement)
  }

  /**
   * Check if if statement is safe to transform (remove braces)
   */
  private isSafeToTransform(ifStmt: IfStatement): boolean {
    // Must not have else clause
    if (ifStmt.getElseStatement()) return false

    const thenStmt = ifStmt.getThenStatement()

    // Must be a block (has braces)
    if (thenStmt.getKind() !== SyntaxKind.Block) return false

    const block = thenStmt as Block
    const statements = block.getStatements()

    // Must have exactly one statement
    if (statements.length !== 1) return false

    const singleStatement = statements[0]

    if (!singleStatement) return false

    // Statement must not be another if (nested if)
    if (singleStatement.getKind() === SyntaxKind.IfStatement) return false

    // Must not have comments inside block
    const blockText = block.getText()

    if (blockText.includes('//') || blockText.includes('/*')) return false

    // Get statement text for analysis
    const statementText = singleStatement.getText().replace(/;$/, '')

    // 🎯 Skip if statement returns an object literal
    // Prettier wraps object literals based on various heuristics (not just printWidth)
    // causing ESLint curly: multi-line errors after formatting
    if (this.containsObjectLiteralReturn(statementText)) return false

    // Check if combined line would be too long
    const conditionText = ifStmt.getExpression().getText()
    const combinedLine = `if (${conditionText}) ${statementText}`

    // Get indentation of original if statement
    const indent = this.getIndentation(ifStmt)

    if (indent.length + combinedLine.length > MAX_LINE_LENGTH) return false

    return true
  }

  private getIndentation(ifStmt: IfStatement): string {
    const fullText = ifStmt.getFullText()
    const leadingWhitespace = /^[\t ]*/.exec(fullText)?.[0] || ''

    return leadingWhitespace.replaceAll('\n', '')
  }

  /**
   * Check if statement returns an object literal
   * Prettier wraps object literals to multiple lines based on various heuristics
   * (not just printWidth), which causes ESLint curly: multi-line errors
   *
   * Skip ANY return statement with object literal to be safe
   */
  private containsObjectLiteralReturn(statementText: string): boolean {
    // Match: return { ... } - any return with object literal
    // This is conservative but safe - Prettier's object literal wrapping
    // behavior is complex and hard to predict
    return /^return\s+\{/.test(statementText.trim())
  }

  /**
   * Transform if statement to single line without braces
   */
  private transform(ifStmt: IfStatement): TransformResult {
    try {
      const conditionText = ifStmt.getExpression().getText()
      const block = ifStmt.getThenStatement() as Block
      const singleStatement = block.getStatements()[0]

      if (!singleStatement) return { success: false, error: 'No statement found' }

      // Remove trailing semicolon if present, we'll add it back
      const statementText = singleStatement.getText().replace(/;$/, '')

      const newText = `if (${conditionText}) ${statementText}`

      ifStmt.replaceWithText(newText)

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}
