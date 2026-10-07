/**
 * Single Line Arrow Fixer - Converts a multi-line arrow whose only statement is `return`
 * into an expression body.
 *
 * Converts:
 *   const fn = <T>(value: T): T => {
 *     return value
 *   }
 *
 * To:
 *   const fn = <T>(value: T): T => value
 *
 * The original signature, including type parameters and the return type, is kept.
 * Expression-statement bodies are left alone: `() => { items.push(1) }` returns
 * `undefined`, while `() => items.push(1)` returns the new length.
 *
 * Rules:
 * - Body must be a single return statement
 * - Combined line must be < MAX_LINE_LENGTH characters
 * - No comments inside body
 * - Returned assignments and object literals get wrapped in parentheses
 */

import * as ts from 'typescript'
import {
  SyntaxKind,
  type SourceFile,
  type ArrowFunction,
  type Block,
  type ReturnStatement,
  type Statement,
  type BinaryExpression,
  type Expression
} from 'ts-morph'
import type { Fix, ScriptUnit, Transaction, TransformResult } from '@/types'
import { FIXER_TYPE } from '@/constants'
import { isJsxSource } from '@/constants/extensions'
import { BaseFixer } from '@/fixers/BaseFixer'
import { errorMessage } from '@/utils/errorMessage'

const MAX_LINE_LENGTH = 120

/** Binding used only to parse a candidate arrow. Never written to disk. */
const ARROW_REPLACEMENT_PROBE_BINDING = 'probe'
const ARROW_PROBE_TS_FILE = 'arrow-replacement-probe.ts'
const ARROW_PROBE_TSX_FILE = 'arrow-replacement-probe.tsx'

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
    try {
      return await this.editScripts(filePath, unit => this.fixArrowFunctions(unit, filePath, transaction))
    } catch (error) {
      return this.skip(filePath, error)
    }
  }

  private fixArrowFunctions(unit: ScriptUnit, filePath: string, transaction: Transaction): Fix[] {
    const fixes: Fix[] = []
    const arrowFunctions = this.findArrowFunctions(unit.sourceFile)
    const sortedFunctions = [...arrowFunctions].sort((left, right) => right.getStart() - left.getStart())

    for (const arrowFn of sortedFunctions) {
      const result = this.processArrowFunction(arrowFn, filePath, transaction, unit.toFileLine)

      if (result) fixes.push(result)
    }

    return fixes
  }

  private findArrowFunctions(sourceFile: SourceFile): ArrowFunction[] {
    return sourceFile.getDescendantsOfKind(SyntaxKind.ArrowFunction)
  }

  /**
   * Process single arrow function
   */
  private processArrowFunction(
    arrowFn: ArrowFunction,
    filePath: string,
    transaction: Transaction,
    toFileLine: ScriptUnit['toFileLine']
  ): Fix | null {
    if (!this.hasBlockBody(arrowFn)) return null

    const block = arrowFn.getBody() as Block
    const statement = this.getSingleStatement(block)

    if (!statement) return null
    if (this.hasComments(block)) return null

    const newBody = this.extractNewBody(statement)

    if (!newBody) return null
    if (this.wouldExceedLineLength(arrowFn, newBody)) return null

    const lineNumber = toFileLine(arrowFn.getStartLineNumber())
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

    if (stmt.getKind() !== SyntaxKind.ReturnStatement) return null

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
    if (statement.getKind() !== SyntaxKind.ReturnStatement) return null

    return this.extractFromReturn(statement as ReturnStatement)
  }

  /**
   * Extract body from return statement
   */
  private extractFromReturn(returnStmt: ReturnStatement): string | null {
    const expr = returnStmt.getExpression()

    // A bare return yields the primitive undefined. `=> undefined` reads the binding, which can be shadowed.
    if (!expr) return null

    const exprText = expr.getText()

    return this.needsParentheses(expr, exprText) ? `(${exprText})` : exprText
  }

  /**
   * As a concise arrow body, `{` starts a block (an object literal, or any expression that begins with one), a
   * top-level comma ends the body and turns the rest into another argument, and an assignment trips
   * `no-return-assign`. Parentheses keep the meaning.
   */
  private needsParentheses(expr: Expression, exprText: string): boolean {
    return this.isAssignmentExpression(expr) || this.isCommaExpression(expr) || exprText.startsWith('{')
  }

  private isCommaExpression(expr: Expression): boolean {
    if (expr.getKind() !== SyntaxKind.BinaryExpression) return false

    return (expr as BinaryExpression).getOperatorToken().getKind() === SyntaxKind.CommaToken
  }

  private isAssignmentExpression(expr: Expression): boolean {
    if (expr.getKind() !== SyntaxKind.BinaryExpression) return false

    const operatorKind = (expr as BinaryExpression).getOperatorToken().getKind()

    return ASSIGNMENT_OPERATORS.has(operatorKind)
  }

  /** Signature text through `=>`, taken from the source so type parameters and return types stay. */
  private arrowHead(arrowFn: ArrowFunction): string {
    const body = arrowFn.getBody()
    const bodyOffset = body.getStart() - arrowFn.getStart()

    return arrowFn.getText().slice(0, bodyOffset).trimEnd()
  }

  private wouldExceedLineLength(arrowFn: ArrowFunction, newBody: string): boolean {
    const combinedLine = `${this.arrowHead(arrowFn)} ${newBody}`

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

  private isTsxSource(arrowFn: ArrowFunction): boolean {
    const filePath = arrowFn.getSourceFile().getFilePath()

    return isJsxSource(filePath)
  }

  private replacementSyntaxError(arrowFn: ArrowFunction, newText: string): string | undefined {
    const tsx = this.isTsxSource(arrowFn)
    const compilerOptions: ts.CompilerOptions = { target: ts.ScriptTarget.Latest }

    if (tsx) compilerOptions.jsx = ts.JsxEmit.Preserve

    const parsed = ts.transpileModule(`const ${ARROW_REPLACEMENT_PROBE_BINDING} = ${newText}\n`, {
      fileName: tsx ? ARROW_PROBE_TSX_FILE : ARROW_PROBE_TS_FILE,
      reportDiagnostics: true,
      compilerOptions
    })
    const diagnostic = parsed.diagnostics?.[0]

    if (diagnostic === undefined) return undefined

    return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
  }

  private transformArrowFunction(arrowFn: ArrowFunction, newBody: string): TransformResult {
    const head = this.arrowHead(arrowFn)

    if (head.length === 0) return { success: false, error: 'Arrow signature is empty' }

    const newText = `${head} ${newBody}`
    const syntaxError = this.replacementSyntaxError(arrowFn, newText)

    if (syntaxError !== undefined) return { success: false, error: syntaxError }

    try {
      arrowFn.replaceWithText(newText)

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: errorMessage(error)
      }
    }
  }
}
