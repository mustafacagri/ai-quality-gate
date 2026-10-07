/**
 * Vue SFC script blocks. Offsets refer to the original file, not a padded extract.
 */

import type { VueScriptLang } from '@/constants/vue'

export interface VueScriptBlock {
  readonly lang: VueScriptLang
  readonly content: string
  readonly startOffset: number
  readonly endOffset: number
  readonly startLine: number
}

export interface SourceRangeReplacement {
  readonly startOffset: number
  readonly endOffset: number
  readonly content: string
}
