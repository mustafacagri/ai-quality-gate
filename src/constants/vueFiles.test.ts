import { describe, expect, it } from 'vitest'

import { isVueScriptLang, VUE_SCRIPT_LANG } from '@/constants/vue'
import { isLintableFile, isPrettierFormattableFile, isTypeScriptFile, isVueSfc } from '@/constants/extensions'

const WIDGET_SFC = 'components/Widget.vue'

describe('Vue file classification', () => {
  it('treats .vue as lintable and formattable, not as a tsc input', () => {
    expect(isVueSfc(WIDGET_SFC)).toBe(true)
    expect(isVueSfc('components/Widget.VUE')).toBe(true)
    expect(isLintableFile(WIDGET_SFC)).toBe(true)
    expect(isPrettierFormattableFile(WIDGET_SFC)).toBe(true)
    expect(isPrettierFormattableFile('src/util.mts')).toBe(true)
    expect(isPrettierFormattableFile('package.json')).toBe(true)
    expect(isTypeScriptFile(WIDGET_SFC)).toBe(false)
    expect(isPrettierFormattableFile('README.md')).toBe(false)
  })

  it('recognizes script languages the gate can parse', () => {
    expect(isVueScriptLang(VUE_SCRIPT_LANG.TS)).toBe(true)
    expect(isVueScriptLang('TS')).toBe(false)
    expect(isVueScriptLang('coffee')).toBe(false)
  })
})
