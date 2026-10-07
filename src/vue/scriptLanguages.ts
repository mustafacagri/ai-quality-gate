/**
 * Which languages the script blocks of a Vue file declare.
 * Decides which ESLint rule set a file gets and whether it belongs in the type check.
 * Read from the compiler's descriptor, so a block whose code lives in another file (`<script src>`) still counts.
 */

import fs from 'node:fs'

import { parse } from '@vue/compiler-sfc'

import { VUE_PLAIN_JS_LANGS, VUE_SCRIPT_LANG, VUE_TYPESCRIPT_LANGS } from '@/constants/vue'

const isOneOf = (languages: readonly string[], lang: string): boolean => languages.includes(lang)

interface CachedLanguages {
  readonly mtimeMs: number
  readonly size: number
  readonly languages: readonly string[]
}

/**
 * One run asks about the same file several times: to pick a rule set, to decide on the type check, for each pass.
 * Parsing it each time is wasted work, so the answer is kept for as long as the file is unchanged. The MCP server
 * outlives many edits, which is why the key includes the modification time and the size.
 */
const languageCache = new Map<string, CachedLanguages>()
const MAX_CACHED_FILES = 200

const parseScriptLanguages = (file: string): string[] => {
  const { descriptor, errors } = parse(fs.readFileSync(file, 'utf8'), { filename: file, sourceMap: false })

  if (errors.length > 0) return []

  return [descriptor.script, descriptor.scriptSetup]
    .filter(block => block !== null)
    .map(block => (block.lang ?? VUE_SCRIPT_LANG.JS).toLowerCase())
}

/**
 * `lang` of each `<script>` / `<script setup>`, lower case, `js` when none is given.
 * Empty for a missing or unreadable file, a structurally invalid SFC, or one without a script.
 */
export const readVueScriptLanguages = (file: string): string[] => {
  try {
    const { mtimeMs, size } = fs.statSync(file)
    const cached = languageCache.get(file)

    if (cached?.mtimeMs === mtimeMs && cached.size === size) return [...cached.languages]

    const languages = parseScriptLanguages(file)

    languageCache.delete(file)
    languageCache.set(file, { mtimeMs, size, languages })

    if (languageCache.size > MAX_CACHED_FILES) {
      const oldest = languageCache.keys().next().value

      if (oldest !== undefined) languageCache.delete(oldest)
    }

    return [...languages]
  } catch {
    return []
  }
}

/** Every script block is plain JavaScript (with or without JSX). */
export const hasPlainJsScript = (file: string): boolean => {
  const languages = readVueScriptLanguages(file)

  return languages.length > 0 && languages.every(lang => isOneOf(VUE_PLAIN_JS_LANGS, lang))
}

/** At least one script block is TypeScript, so `vue-tsc` has something to check. */
export const hasTypeScriptScript = (file: string): boolean =>
  readVueScriptLanguages(file).some(lang => isOneOf(VUE_TYPESCRIPT_LANGS, lang))
