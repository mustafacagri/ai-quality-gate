/**
 * Read and splice `<script>` / `<script setup>` blocks inside a Vue single-file component.
 * Block boundaries come from the Vue SFC parser, not from regular expressions.
 * Template and style bytes are never part of the returned script text.
 */

import { parse, type SFCDescriptor, type SFCParseResult, type SFCScriptBlock } from '@vue/compiler-sfc'

import { VUE_SCRIPT_LANG, isVueScriptLang } from '@/constants/vue'
import type { SourceRangeReplacement, VueScriptBlock } from '@/types/vue'
import { errorMessage } from '@/utils/errorMessage'

const INVERTED_SCRIPT_OFFSETS = 'Script block offsets are inverted'

export class VueSfcParseError extends Error {
  constructor(filePath: string, detail: string) {
    super(`Vue SFC parse failed for ${filePath}: ${detail}`)
    this.name = 'VueSfcParseError'
  }
}

const parseSfc = (source: string, filename: string): SFCParseResult => {
  try {
    return parse(source, { filename, sourceMap: false })
  } catch (error) {
    throw new VueSfcParseError(filename, errorMessage(error))
  }
}

const resolveLang = (lang: string | undefined): VueScriptBlock['lang'] | undefined => {
  if (lang === undefined) return VUE_SCRIPT_LANG.JS

  const normalized = lang.toLowerCase()

  if (isVueScriptLang(normalized)) return normalized

  return undefined
}

const toScriptBlock = (source: string, filename: string, block: SFCScriptBlock): VueScriptBlock | undefined => {
  if (block.src !== undefined) return undefined

  const lang = resolveLang(block.lang)

  if (lang === undefined) return undefined

  const startOffset = block.loc.start.offset
  const endOffset = block.loc.end.offset

  if (endOffset < startOffset) throw new VueSfcParseError(filename, INVERTED_SCRIPT_OFFSETS)

  return {
    lang,
    content: source.slice(startOffset, endOffset),
    startOffset,
    endOffset,
    startLine: block.loc.start.line
  }
}

const collectScriptBlocks = (source: string, filename: string, descriptor: SFCDescriptor): VueScriptBlock[] => {
  const rawBlocks: SFCScriptBlock[] = []

  if (descriptor.script !== null) rawBlocks.push(descriptor.script)

  if (descriptor.scriptSetup !== null) rawBlocks.push(descriptor.scriptSetup)

  const blocks: VueScriptBlock[] = []

  for (const rawBlock of [...rawBlocks].sort((left, right) => left.loc.start.offset - right.loc.start.offset)) {
    const block = toScriptBlock(source, filename, rawBlock)

    if (block !== undefined) blocks.push(block)
  }

  return blocks
}

/**
 * Script blocks whose ranges are safe to edit.
 * Structural SFC errors return no blocks so a fixer cannot splice with bad offsets.
 * ESLint still reports those files.
 */
export const readVueScriptBlocks = (source: string, filename: string): VueScriptBlock[] => {
  const parsed = parseSfc(source, filename)

  if (parsed.errors.length > 0) return []

  return collectScriptBlocks(source, filename, parsed.descriptor)
}

export const replaceSourceRanges = (source: string, replacements: readonly SourceRangeReplacement[]): string => {
  const ordered = [...replacements].sort((left, right) => right.startOffset - left.startOffset)
  let next = source

  for (const replacement of ordered) {
    next = `${next.slice(0, replacement.startOffset)}${replacement.content}${next.slice(replacement.endOffset)}`
  }

  return next
}
