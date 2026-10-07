/**
 * Base Fixer - Common functionality for all AST fixers
 * DRY: Eliminates duplicate code between fixer implementations
 */

import { Project, type SourceFile } from 'ts-morph'
import type { Fixer, Fix, Transaction, FixerType, ScriptUnit } from '@/types'
import { createScriptEditSession, loadDiskSourceFile } from '@/fixers/scriptEditSession'
import { errorMessage } from '@/utils/errorMessage'

export abstract class BaseFixer implements Fixer {
  abstract readonly name: FixerType

  protected readonly project: Project

  private skipped: string[] = []

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
    return loadDiskSourceFile(this.project, filePath)
  }

  /**
   * Edit every script program in the file, then persist.
   * Vue SFCs contribute one program per `<script>` / `<script setup>` block.
   */
  protected async editScripts(filePath: string, edit: (unit: ScriptUnit) => readonly Fix[]): Promise<Fix[]> {
    const session = createScriptEditSession(this.project, filePath)

    try {
      const fixes: Fix[] = []

      for (const unit of session.units) fixes.push(...edit(unit))

      if (fixes.length > 0) await session.commit()

      return fixes
    } finally {
      session.dispose()
    }
  }

  /**
   * A file the fixer could not process is left as it is. The failure is logged and kept for the report, so that
   * a fixer which never works on some file is not mistaken for a file with nothing to fix.
   */
  protected skip(filePath: string, error: unknown): Fix[] {
    console.error(`${this.constructor.name} error in ${filePath}:`, error)

    this.skipped.push(`${this.name} skipped ${filePath}: ${errorMessage(error)}`)

    return []
  }

  takeSkipped(): string[] {
    const taken = this.skipped

    this.skipped = []

    return taken
  }

  /**
   * Abstract method - each fixer implements its own logic
   */
  abstract scanAndFix(filePath: string, transaction: Transaction): Promise<Fix[]>
}
