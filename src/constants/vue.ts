/**
 * Vue single-file component script languages the gate can parse as JavaScript or TypeScript.
 * Other `lang` values (for example `coffee`) are left untouched.
 */

export const VUE_SCRIPT_LANG = {
  JS: 'js',
  JSX: 'jsx',
  TS: 'ts',
  TSX: 'tsx'
} as const

export type VueScriptLang = (typeof VUE_SCRIPT_LANG)[keyof typeof VUE_SCRIPT_LANG]

export const VUE_SCRIPT_LANGS = [
  VUE_SCRIPT_LANG.JS,
  VUE_SCRIPT_LANG.JSX,
  VUE_SCRIPT_LANG.TS,
  VUE_SCRIPT_LANG.TSX
] as const

/** In-memory ts-morph path segment. Never written next to the `.vue` file. */
export const VUE_IN_MEMORY_SCRIPT_SUFFIX = '.aqg-vue-script'

const VUE_SCRIPT_LANG_VALUES: readonly string[] = VUE_SCRIPT_LANGS

export const isVueScriptLang = (value: string): value is VueScriptLang => VUE_SCRIPT_LANG_VALUES.includes(value)

/**
 * Set to `js` in the environment of an ESLint process that lints Vue files whose script is plain JavaScript.
 * `src/eslint/config.mjs` is shipped as plain ESM and keeps its own copy of the name.
 */
export const VUE_SCRIPT_LANG_ENV = 'AQG_VUE_SCRIPT_LANG'

/** Value of {@link VUE_SCRIPT_LANG_ENV} that selects the JavaScript rule set. */
export const VUE_PLAIN_JS_SCRIPT = 'js'

/** `lang` values that mean plain JavaScript, with or without JSX. */
export const VUE_PLAIN_JS_LANGS: readonly VueScriptLang[] = [VUE_SCRIPT_LANG.JS, VUE_SCRIPT_LANG.JSX]

/** `lang` values that mean TypeScript, with or without JSX. */
export const VUE_TYPESCRIPT_LANGS: readonly VueScriptLang[] = [VUE_SCRIPT_LANG.TS, VUE_SCRIPT_LANG.TSX]
