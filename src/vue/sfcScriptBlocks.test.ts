import { describe, expect, it } from 'vitest'

import { VUE_SCRIPT_LANG } from '@/constants/vue'

import { VueSfcParseError, readVueScriptBlocks, replaceSourceRanges } from './sfcScriptBlocks'

describe('VueSfcParseError', () => {
  it('names the file that failed to parse', () => {
    const error = new VueSfcParseError('Widget.vue', 'broken')

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('VueSfcParseError')
    expect(error.message).toBe('Vue SFC parse failed for Widget.vue: broken')
  })
})

describe('readVueScriptBlocks', () => {
  it('returns script and script setup ranges without template or style text', () => {
    const source = `<template>
  <p>1 == 2</p>
</template>
<script lang="ts">
export const legacy = 1
</script>
<script setup lang="tsx">
const run = 1
</script>
<style scoped>
p { color: red; }
</style>
`
    const blocks = readVueScriptBlocks(source, 'Widget.vue')

    const legacy = blocks[0]
    const setup = blocks[1]

    expect(blocks.map(block => block.lang)).toEqual([VUE_SCRIPT_LANG.TS, VUE_SCRIPT_LANG.TSX])
    expect(legacy?.content).toBe('\nexport const legacy = 1\n')
    expect(setup?.content).toBe('\nconst run = 1\n')
    expect(blocks.every(block => !block.content.includes('<p>'))).toBe(true)
    expect(blocks.every(block => !block.content.includes('color: red'))).toBe(true)

    if (legacy === undefined) throw new Error('expected script block')

    expect(source.slice(legacy.startOffset, legacy.endOffset)).toBe(legacy.content)
  })

  it('treats a script without lang as JavaScript and keeps the generic attribute outside the body', () => {
    const source = `<script setup generic="T extends string">
const value = 1
</script>
`
    const blocks = readVueScriptBlocks(source, 'Generic.vue')

    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.lang).toBe(VUE_SCRIPT_LANG.JS)
    expect(blocks[0]?.content).toContain('const value = 1')
    expect(blocks[0]?.content).not.toContain('generic')
  })

  it('skips external and non-JS script languages', () => {
    const external = `<template><p>Hi</p></template>\n<script src="./ext.ts"></script>\n`
    const coffee = `<template><p>Hi</p></template>\n<script lang="coffee">\nfoo\n</script>\n`

    expect(readVueScriptBlocks(external, 'External.vue')).toEqual([])
    expect(readVueScriptBlocks(coffee, 'Coffee.vue')).toEqual([])
  })

  it('returns no blocks when the SFC structure is invalid', () => {
    const source = `<script setup lang="ts">\nconst value = 1\n`

    expect(readVueScriptBlocks(source, 'Broken.vue')).toEqual([])
  })
})

describe('replaceSourceRanges', () => {
  it('applies a later range before an earlier one so length changes stay aligned', () => {
    const updated = replaceSourceRanges('AAAA', [
      { startOffset: 0, endOffset: 2, content: 'X' },
      { startOffset: 2, endOffset: 4, content: 'YZ' }
    ])

    expect(updated).toBe('XYZ')
  })
})
