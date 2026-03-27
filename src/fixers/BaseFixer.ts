/**
 * Base Fixer - Common functionality for all AST fixers
 * DRY: Eliminates duplicate code between fixer implementations
 */

import { Project, type SourceFile } from 'ts-morph'
import type { Fixer, Fix, Transaction, FixerType } from '@/types'

export abstract class BaseFixer implements Fixer {
  abstract readonly name: FixerType

  protected readonly project: Project

  constructor() {
    this.project = new Project({
      useInMemoryFileSystem: false,
      skipAddingFilesFromTsConfig: true
    })
  }

  /**
   * Get or add source file to project
   * Handles the case where file might already be added
   */
  protected getSourceFile(filePath: string): SourceFile {
    try {
      return this.project.addSourceFileAtPath(filePath)
    } catch {
      // File might already be added
      return this.project.getSourceFileOrThrow(filePath)
    }
  }

  /**
   * Cleanup: Remove source file from project to avoid memory leaks
   */
  protected cleanupSourceFile(sourceFile: SourceFile): void {
    this.project.removeSourceFile(sourceFile)
  }

  /**
   * Abstract method - each fixer implements its own logic
   */
  abstract scanAndFix(filePath: string, transaction: Transaction): Promise<Fix[]>
}
