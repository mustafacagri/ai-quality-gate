/**
 * Opens the programs AST fixers are allowed to edit.
 * Plain JS/TS files are the file itself.
 * Vue SFCs expose each `<script>` / `<script setup>` block as its own in-memory program
 * and write changes back into that block only.
 */

import fs from 'node:fs'

import { ScriptKind, type Project, type SourceFile } from 'ts-morph'

import { isVueSfc } from '@/constants/extensions'
import { VUE_IN_MEMORY_SCRIPT_SUFFIX, VUE_SCRIPT_LANG, type VueScriptLang } from '@/constants/vue'
import type { ScriptEditSession, ScriptUnit } from '@/types'
import type { SourceRangeReplacement, VueScriptBlock } from '@/types/vue'
import { readVueScriptBlocks, replaceSourceRanges } from '@/vue/sfcScriptBlocks'

interface VueScriptUnit extends ScriptUnit {
  readonly block: VueScriptBlock
}

const SCRIPT_KIND_BY_LANG: Record<VueScriptLang, ScriptKind> = {
  [VUE_SCRIPT_LANG.JS]: ScriptKind.JS,
  [VUE_SCRIPT_LANG.JSX]: ScriptKind.JSX,
  [VUE_SCRIPT_LANG.TS]: ScriptKind.TS,
  [VUE_SCRIPT_LANG.TSX]: ScriptKind.TSX
}

const scriptKindForLang = (lang: VueScriptLang): ScriptKind => SCRIPT_KIND_BY_LANG[lang]

export const loadDiskSourceFile = (project: Project, filePath: string): SourceFile => {
  try {
    return project.addSourceFileAtPath(filePath)
  } catch {
    // The file is already in the project.
    return project.getSourceFileOrThrow(filePath)
  }
}

const fileLineForBlock = (block: VueScriptBlock, scriptLine: number): number => block.startLine + scriptLine - 1

const createVueUnit = (project: Project, filePath: string, block: VueScriptBlock, index: number): VueScriptUnit => {
  const virtualPath = `${filePath}${VUE_IN_MEMORY_SCRIPT_SUFFIX}-${String(index)}.${block.lang}`
  const sourceFile = project.createSourceFile(virtualPath, block.content, {
    overwrite: true,
    scriptKind: scriptKindForLang(block.lang)
  })

  return {
    block,
    sourceFile,
    toFileLine: scriptLine => fileLineForBlock(block, scriptLine)
  }
}

const commitVueFile = (filePath: string, original: string, units: readonly VueScriptUnit[]): void => {
  const replacements: SourceRangeReplacement[] = []

  for (const unit of units) {
    const next = unit.sourceFile.getFullText()

    if (next === unit.block.content) continue

    replacements.push({
      startOffset: unit.block.startOffset,
      endOffset: unit.block.endOffset,
      content: next
    })
  }

  if (replacements.length === 0) return

  fs.writeFileSync(filePath, replaceSourceRanges(original, replacements), 'utf8')
}

const openVueSession = (project: Project, filePath: string): ScriptEditSession => {
  const original = fs.readFileSync(filePath, 'utf8')
  const units: VueScriptUnit[] = []

  try {
    let index = 0

    for (const block of readVueScriptBlocks(original, filePath)) {
      units.push(createVueUnit(project, filePath, block, index))
      index += 1
    }
  } catch (error) {
    for (const unit of units) project.removeSourceFile(unit.sourceFile)

    throw error
  }

  return {
    units,
    commit: () => {
      commitVueFile(filePath, original, units)

      return Promise.resolve()
    },
    dispose: () => {
      for (const unit of units) project.removeSourceFile(unit.sourceFile)
    }
  }
}

const openDiskSession = (project: Project, filePath: string): ScriptEditSession => {
  const sourceFile = loadDiskSourceFile(project, filePath)
  const units: ScriptUnit[] = [
    {
      sourceFile,
      toFileLine: scriptLine => scriptLine
    }
  ]

  return {
    units,
    commit: () => sourceFile.save(),
    dispose: () => project.removeSourceFile(sourceFile)
  }
}

export const createScriptEditSession = (project: Project, filePath: string): ScriptEditSession => {
  if (isVueSfc(filePath)) return openVueSession(project, filePath)

  return openDiskSession(project, filePath)
}
