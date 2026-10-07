/**
 * Supported File Extensions
 * Only these extensions will be checked by quality_fix
 * Documentation (.md), config (.json, .yml) etc. are skipped
 */

export const VUE_SFC_EXTENSION = '.vue' as const

export const SUPPORTED_CODE_EXTENSIONS = new Set([
  // ═══════════════════════════════════════════════════════════════════════════
  // JavaScript/TypeScript (Primary Focus)
  // ═══════════════════════════════════════════════════════════════════════════
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',

  // ═══════════════════════════════════════════════════════════════════════════
  // Frontend Frameworks
  // ═══════════════════════════════════════════════════════════════════════════
  VUE_SFC_EXTENSION,
  '.svelte',
  '.astro',

  // ═══════════════════════════════════════════════════════════════════════════
  // Python
  // ═══════════════════════════════════════════════════════════════════════════
  '.py',
  '.pyw',
  '.pyx',

  // ═══════════════════════════════════════════════════════════════════════════
  // Go
  // ═══════════════════════════════════════════════════════════════════════════
  '.go',

  // ═══════════════════════════════════════════════════════════════════════════
  // Rust
  // ═══════════════════════════════════════════════════════════════════════════
  '.rs',

  // ═══════════════════════════════════════════════════════════════════════════
  // Java/Kotlin
  // ═══════════════════════════════════════════════════════════════════════════
  '.java',
  '.kt',
  '.kts',

  // ═══════════════════════════════════════════════════════════════════════════
  // C/C++
  // ═══════════════════════════════════════════════════════════════════════════
  '.c',
  '.cpp',
  '.cc',
  '.cxx',
  '.h',
  '.hpp',
  '.hxx',

  // ═══════════════════════════════════════════════════════════════════════════
  // C#
  // ═══════════════════════════════════════════════════════════════════════════
  '.cs',

  // ═══════════════════════════════════════════════════════════════════════════
  // Ruby
  // ═══════════════════════════════════════════════════════════════════════════
  '.rb',
  '.rake',

  // ═══════════════════════════════════════════════════════════════════════════
  // PHP
  // ═══════════════════════════════════════════════════════════════════════════
  '.php',

  // ═══════════════════════════════════════════════════════════════════════════
  // Swift
  // ═══════════════════════════════════════════════════════════════════════════
  '.swift',

  // ═══════════════════════════════════════════════════════════════════════════
  // Scala
  // ═══════════════════════════════════════════════════════════════════════════
  '.scala',
  '.sc',

  // ═══════════════════════════════════════════════════════════════════════════
  // Elixir/Erlang
  // ═══════════════════════════════════════════════════════════════════════════
  '.ex',
  '.exs',
  '.erl',

  // ═══════════════════════════════════════════════════════════════════════════
  // Haskell
  // ═══════════════════════════════════════════════════════════════════════════
  '.hs',
  '.lhs',

  // ═══════════════════════════════════════════════════════════════════════════
  // Lua
  // ═══════════════════════════════════════════════════════════════════════════
  '.lua',

  // ═══════════════════════════════════════════════════════════════════════════
  // R
  // ═══════════════════════════════════════════════════════════════════════════
  '.r',
  '.R',

  // ═══════════════════════════════════════════════════════════════════════════
  // Shell
  // ═══════════════════════════════════════════════════════════════════════════
  '.sh',
  '.bash',
  '.zsh',

  // ═══════════════════════════════════════════════════════════════════════════
  // Dart
  // ═══════════════════════════════════════════════════════════════════════════
  '.dart',

  // ═══════════════════════════════════════════════════════════════════════════
  // Zig
  // ═══════════════════════════════════════════════════════════════════════════
  '.zig',

  // ═══════════════════════════════════════════════════════════════════════════
  // Nim
  // ═══════════════════════════════════════════════════════════════════════════
  '.nim',

  // ═══════════════════════════════════════════════════════════════════════════
  // Crystal
  // ═══════════════════════════════════════════════════════════════════════════
  '.cr',

  // ═══════════════════════════════════════════════════════════════════════════
  // Julia
  // ═══════════════════════════════════════════════════════════════════════════
  '.jl',

  // ═══════════════════════════════════════════════════════════════════════════
  // Clojure
  // ═══════════════════════════════════════════════════════════════════════════
  '.clj',
  '.cljs',
  '.cljc',

  // ═══════════════════════════════════════════════════════════════════════════
  // F#
  // ═══════════════════════════════════════════════════════════════════════════
  '.fs',
  '.fsx',

  // ═══════════════════════════════════════════════════════════════════════════
  // OCaml
  // ═══════════════════════════════════════════════════════════════════════════
  '.ml',
  '.mli',

  // ═══════════════════════════════════════════════════════════════════════════
  // Perl
  // ═══════════════════════════════════════════════════════════════════════════
  '.pl',
  '.pm',

  // ═══════════════════════════════════════════════════════════════════════════
  // Groovy
  // ═══════════════════════════════════════════════════════════════════════════
  '.groovy',
  '.gvy'
])

/**
 * Check if a file extension is supported for quality checks
 */
export const isSupportedExtension = (ext: string): boolean => SUPPORTED_CODE_EXTENSIONS.has(ext.toLowerCase())

// ═══════════════════════════════════════════════════════════════════════════
// Lintable Extensions (ESLint Compatible)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * File extensions that can be linted by ESLint
 */
export const TYPESCRIPT_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'] as const
export const JAVASCRIPT_EXTENSIONS = ['.js', '.jsx', '.mjs', '.cjs'] as const
export const LINTABLE_EXTENSIONS = [...TYPESCRIPT_EXTENSIONS, ...JAVASCRIPT_EXTENSIONS, VUE_SFC_EXTENSION] as const

const endsWithExtension = (filePath: string, extensions: readonly string[]): boolean => {
  const normalized = filePath.toLowerCase()

  return extensions.some(extension => normalized.endsWith(extension))
}

export const isTypeScriptFile = (filePath: string): boolean => endsWithExtension(filePath, TYPESCRIPT_EXTENSIONS)

export const isVueSfc = (filePath: string): boolean => endsWithExtension(filePath, [VUE_SFC_EXTENSION])

/** Sources in which `<` can start a JSX element, so a TypeScript arrow `<T>(x) => x` would be ambiguous. */
const JSX_EXTENSIONS = ['.tsx', '.jsx'] as const

export const isJsxSource = (filePath: string): boolean => endsWithExtension(filePath, JSX_EXTENSIONS)

export type LintableExtension = (typeof LINTABLE_EXTENSIONS)[number]

/**
 * Check if a file can be linted by ESLint.
 * `.vue` is linted in place: script blocks only, via vue-eslint-parser.
 */
export const isLintableFile = (filePath: string): boolean => endsWithExtension(filePath, LINTABLE_EXTENSIONS)

// ═══════════════════════════════════════════════════════════════════════════
// JSON/Config Extensions (Validated separately)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * File extensions that are validated as JSON
 */
export const JSON_EXTENSIONS = ['.json'] as const

export type JsonExtension = (typeof JSON_EXTENSIONS)[number]

/**
 * Check if a file is a JSON file
 */
export const isJsonFile = (filePath: string): boolean => endsWithExtension(filePath, JSON_EXTENSIONS)

export const PRETTIER_EXTENSIONS = [...LINTABLE_EXTENSIONS, ...JSON_EXTENSIONS] as const

export const isPrettierFormattableFile = (filePath: string): boolean => endsWithExtension(filePath, PRETTIER_EXTENSIONS)

/**
 * i18n locale file patterns for consistency checking
 */
export const I18N_LOCALE_PATTERNS = [
  /\/locales\/[a-z]{2}\.json$/i, // /locales/en.json, /locales/tr.json
  /\/i18n\/.*\/[a-z]{2}\.json$/i, // /i18n/locales/en.json
  /\/translations\/[a-z]{2}\.json$/i, // /translations/en.json
  /\.[a-z]{2}\.json$/i // file.en.json, file.tr.json
] as const

/**
 * Check if a file is an i18n locale file
 */
export const isI18nLocaleFile = (filePath: string): boolean =>
  I18N_LOCALE_PATTERNS.some(pattern => pattern.test(filePath))
