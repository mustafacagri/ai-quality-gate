/**
 * Single Line Arrow Fixer - Converts multi-line single-statement arrow functions to single line
 *
 * Converts:
 *   const fn = () => {
 *     return value
 *   }
 *   const fn = () => {
 *     state.value = newValue
 *   }
 *
 * To:
 *   const fn = () => value
 *   const fn = () => (state.value = newValue)
 *
 * Rules:
 * - Body must be single statement (return or expression)
 * - Combined line must be < MAX_LINE_LENGTH characters
 * - No comments inside body
 * - Assignment expressions get wrapped in parentheses (ESLint no-return-assign)
 * - Object literals get wrapped in parentheses
 */

import {
  SyntaxKind,
  type SourceFile,
  type ArrowFunction,
  type Block,
  type ReturnStatement,
  type ExpressionStatement,
  type Statement,
  type BinaryExpression
} from 'ts-morph'
import type { Fix, Transaction, TransformResult } from '@/types'
import { FIXER_TYPE } from '@/constants'
import { BaseFixer } from '@/fixers/BaseFixer'

const MAX_LINE_LENGTH = 120

// Assignment operator kinds
const ASSIGNMENT_OPERATORS = new Set([
  SyntaxKind.EqualsToken,
  SyntaxKind.PlusEqualsToken,
  SyntaxKind.MinusEqualsToken,
  SyntaxKind.AsteriskEqualsToken,
  SyntaxKind.SlashEqualsToken,
  SyntaxKind.PercentEqualsToken,
  SyntaxKind.AmpersandEqualsToken,
  SyntaxKind.BarEqualsToken,
  SyntaxKind.CaretEqualsToken,
  SyntaxKind.LessThanLessThanEqualsToken,
  SyntaxKind.GreaterThanGreaterThanEqualsToken,
  SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
  SyntaxKind.AsteriskAsteriskEqualsToken,
  SyntaxKind.BarBarEqualsToken,
  SyntaxKind.AmpersandAmpersandEqualsToken,
  SyntaxKind.QuestionQuestionEqualsToken
])

export class SingleLineArrowFixer extends BaseFixer {
  readonly name = FIXER_TYPE.SINGLE_LINE_ARROW

  /**
   * Scan file for arrow functions with unnecessary braces
   */
  async scanAndFix(filePath: string, transaction: Transaction): Promise<Fix[]> {
    const fixes: Fix[] = []

    // Skip Vue files - they have complex template handling
    if (filePath.endsWith('.vue')) return fixes

    try {
      const sourceFile = this.getSourceFile(filePath)
      const arrowFunctions = this.findArrowFunctions(sourceFile)
      // Sort in reverse order (end to start) so replacements don't affect positions
      const sortedFunctions = [...arrowFunctions].sort((a, b) => b.getStart() - a.getStart())

      for (const arrowFn of sortedFunctions) {
        const result = this.processArrowFunction(arrowFn, filePath, transaction)

        if (result) fixes.push(result)
      }

      if (fixes.length > 0) await sourceFile.save()

      this.cleanupSourceFile(sourceFile)
    } catch (error) {
      console.error(`SingleLineArrowFixer error in ${filePath}:`, error)
    }

    return fixes
  }

  private findArrowFunctions(sourceFile: SourceFile): ArrowFunction[] {
    return sourceFile.getDescendantsOfKind(SyntaxKind.ArrowFunction)
  }

  /**
   * Process single arrow function
   */
  private processArrowFunction(arrowFn: ArrowFunction, filePath: string, transaction: Transaction): Fix | null {
    if (!this.hasBlockBody(arrowFn)) return null

    const block = arrowFn.getBody() as Block
    const statement = this.getSingleStatement(block)

    if (!statement) return null
    if (this.hasComments(block)) return null

    const newBody = this.extractNewBody(statement)

    if (!newBody) return null
    if (this.wouldExceedLineLength(arrowFn, newBody)) return null

    const lineNumber = arrowFn.getStartLineNumber()
    transaction.recordChange(filePath)

    const result = this.transformArrowFunction(arrowFn, newBody)

    if (!result.success) return null

    return {
      file: filePath,
      line: lineNumber,
      type: FIXER_TYPE.SINGLE_LINE_ARROW,
      description: 'Converted multi-line arrow function to single line'
    }
  }

  /**
   * Check if arrow function has block body (with braces)
   */
  private hasBlockBody(arrowFn: ArrowFunction): boolean {
    return arrowFn.getBody().getKind() === SyntaxKind.Block
  }

  /**
   * Get single statement from block, or null if not exactly one
   */
  private getSingleStatement(block: Block): Statement | null {
    const statements = block.getStatements()

    if (statements.length !== 1) return null

    const stmt = statements[0]

    if (!stmt) return null

    const kind = stmt.getKind()

    // Only allow return statements and expression statements
    if (kind !== SyntaxKind.ReturnStatement && kind !== SyntaxKind.ExpressionStatement) return null

    return stmt
  }

  /**
   * Check if block has comments
   */
  private hasComments(block: Block): boolean {
    const text = block.getText()

    return text.includes('//') || text.includes('/*')
  }

  /**
   * Extract new body from statement
   */
  private extractNewBody(statement: Statement): string | null {
    const kind = statement.getKind()

    if (kind === SyntaxKind.ReturnStatement) return this.extractFromReturn(statement as ReturnStatement)

    if (kind === SyntaxKind.ExpressionStatement) return this.extractFromExpression(statement as ExpressionStatement)

    return null
  }

  /**
   * Extract body from return statement
   */
  private extractFromReturn(returnStmt: ReturnStatement): string {
    const expr = returnStmt.getExpression()

    if (!expr) return 'undefined' // return; → undefined

    const exprText = expr.getText()

    // Object literals need parentheses: () => { a: 1 } is invalid, () => ({ a: 1 }) is valid
    if (expr.getKind() === SyntaxKind.ObjectLiteralExpression) return `(${exprText})`

    return exprText
  }

  /**
   * Extract body from expression statement
   */
  private extractFromExpression(exprStmt: ExpressionStatement): string | null {
    const expr = exprStmt.getExpression()
    const exprText = expr.getText().replace(/;$/, '')

    // Check if it's an assignment expression - wrap in parentheses
    if (expr.getKind() === SyntaxKind.BinaryExpression) {
      const binaryExpr = expr as BinaryExpression
      const operatorKind = binaryExpr.getOperatorToken().getKind()

      if (ASSIGNMENT_OPERATORS.has(operatorKind)) return `(${exprText})`
    }

    return exprText
  }

  /**
   * Check if transformed line would exceed max length
   */
  private wouldExceedLineLength(arrowFn: ArrowFunction, newBody: string): boolean {
    const params = arrowFn
      .getParameters()
      .map(p => p.getText())
      .join(', ')
    const asyncKeyword = arrowFn.isAsync() ? 'async ' : ''
    const needsParens = arrowFn.getParameters().length !== 1 || arrowFn.getParameters()[0]?.getTypeNode() !== undefined
    const paramsText = needsParens ? `(${params})` : params

    const combinedLine = `${asyncKeyword}${paramsText} => ${newBody}`

    // Get the variable declaration context for full line length
    const parent = arrowFn.getParent()
    let prefix = ''

    if (parent.getKind() === SyntaxKind.VariableDeclaration) {
      const firstChild = parent.getChildAtIndex(0)
      const varName = firstChild.getText()
      prefix = `const ${varName} = `
    }

    const indent = this.getIndentation(arrowFn)

    return indent.length + prefix.length + combinedLine.length > MAX_LINE_LENGTH
  }

  /**
   * Get indentation of arrow function
   */
  private getIndentation(arrowFn: ArrowFunction): string {
    let current: ReturnType<ArrowFunction['getParent']> | undefined = arrowFn.getParent()

    while (current !== undefined) {
      if (current.getKind() === SyntaxKind.VariableStatement) {
        const fullText = current.getFullText()
        const match = /^[\t ]*/.exec(fullText)
        const whitespace = match?.[0] ?? ''

        return whitespace.replaceAll('\n', '')
      }

      current = current.getParent()
    }

    return ''
  }

  /**
   * Transform arrow function to single line
   */
  private transformArrowFunction(arrowFn: ArrowFunction, newBody: string): TransformResult {
    try {
      const params = arrowFn
        .getParameters()
        .map(p => p.getText())
        .join(', ')
      const asyncKeyword = arrowFn.isAsync() ? 'async ' : ''
      const needsParens =
        arrowFn.getParameters().length !== 1 || arrowFn.getParameters()[0]?.getTypeNode() !== undefined
      const paramsText = needsParens ? `(${params})` : params

      const newText = `${asyncKeyword}${paramsText} => ${newBody}`

      arrowFn.replaceWithText(newText)

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}
