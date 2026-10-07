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
 * - The statement keeps a trailing semicolon so a following `[` or `(` cannot continue it
 */

import {
  Node,
  SyntaxKind,
  VariableDeclarationKind,
  type SourceFile,
  type IfStatement,
  type Block,
  type Statement
} from 'ts-morph'
import type { Fix, ScriptUnit, Transaction, TransformResult } from '@/types'
import { FIXER_TYPE } from '@/constants'
import { BaseFixer } from '@/fixers/BaseFixer'
import { errorMessage } from '@/utils/errorMessage'

const MAX_LINE_LENGTH = 120

export class CurlyBracesFixer extends BaseFixer {
  readonly name = FIXER_TYPE.CURLY_BRACES

  /**
   * Scan file for if statements with unnecessary braces
   */
  async scanAndFix(filePath: string, transaction: Transaction): Promise<Fix[]> {
    try {
      return await this.editScripts(filePath, unit => this.fixIfStatements(unit, filePath, transaction))
    } catch (error) {
      return this.skip(filePath, error)
    }
  }

  private fixIfStatements(unit: ScriptUnit, filePath: string, transaction: Transaction): Fix[] {
    const fixes: Fix[] = []
    const sortedStatements = [...this.findIfStatements(unit.sourceFile)].sort(
      (left, right) => right.getStart() - left.getStart()
    )

    for (const ifStmt of sortedStatements) {
      if (!this.isSafeToTransform(ifStmt)) continue

      const lineNumber = unit.toFileLine(ifStmt.getStartLineNumber())
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

    if (this.needsEnclosingBlock(singleStatement)) return false

    // Must not have comments inside block
    const blockText = block.getText()

    if (blockText.includes('//') || blockText.includes('/*')) return false

    const statementText = this.statementWithoutTerminator(singleStatement)

    // 🎯 Skip if statement returns an object literal
    // Prettier wraps object literals based on various heuristics (not just printWidth)
    // causing ESLint curly: multi-line errors after formatting
    if (this.containsObjectLiteralReturn(statementText)) return false

    // Check if combined line would be too long
    const conditionText = ifStmt.getExpression().getText()
    const combinedLine = this.rebuildIf(conditionText, singleStatement, statementText)

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
  /**
   * A nested `if` would pair with a later `else`. A declaration is only legal inside a block:
   * `if (x) const y = 1` does not parse. A labeled statement can hide one, and an empty statement is not a
   * legal `if` body, so both keep their block too.
   */
  private needsEnclosingBlock(statement: Statement): boolean {
    if (statement.getKind() === SyntaxKind.IfStatement) return true

    // `label: function f() {}` and `label: const x = 1` carry a declaration the label hides
    if (Node.isLabeledStatement(statement)) return true

    // `if (x) ;` is rejected as an empty `if` body
    if (Node.isEmptyStatement(statement)) return true

    return this.isBlockScopedDeclaration(statement)
  }

  /**
   * Declarations that need the block around them. `var` is function-scoped and stays legal
   * as the body of an `if`.
   */
  private isBlockScopedDeclaration(statement: Statement): boolean {
    if (Node.isVariableStatement(statement)) return statement.getDeclarationKind() !== VariableDeclarationKind.Var

    return (
      Node.isClassDeclaration(statement) ||
      Node.isFunctionDeclaration(statement) ||
      Node.isEnumDeclaration(statement) ||
      Node.isInterfaceDeclaration(statement) ||
      Node.isTypeAliasDeclaration(statement) ||
      Node.isModuleDeclaration(statement)
    )
  }

  /**
   * A statement whose last token is the closing brace of a block needs no `;` after it, and one would be a stray
   * empty statement. Any other statement gets exactly one, so that a following `[` or `(` cannot continue it.
   */
  private rebuildIf(conditionText: string, statement: Statement, statementText: string): string {
    return `if (${conditionText}) ${statementText}${this.endsWithBlock(statement) ? '' : ';'}`
  }

  /** A loop ends with a block only when its body does: `for (x of xs) f(x)` ends with a call. */
  private endsWithBlock(statement: Statement): boolean {
    if (Node.isBlock(statement) || Node.isTryStatement(statement) || Node.isSwitchStatement(statement)) return true

    if (
      Node.isForStatement(statement) ||
      Node.isForInStatement(statement) ||
      Node.isForOfStatement(statement) ||
      Node.isWhileStatement(statement)
    ) {
      return this.endsWithBlock(statement.getStatement())
    }

    return false
  }

  /** Drop one trailing semicolon so the rebuilt statement has exactly one terminator. */
  private statementWithoutTerminator(statement: Statement): string {
    const text = statement.getText()

    if (text.endsWith(';')) return text.slice(0, -1)

    return text
  }

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

      const statementText = this.statementWithoutTerminator(singleStatement)
      const newText = this.rebuildIf(conditionText, singleStatement, statementText)

      ifStmt.replaceWithText(newText)

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: errorMessage(error)
      }
    }
  }
}
