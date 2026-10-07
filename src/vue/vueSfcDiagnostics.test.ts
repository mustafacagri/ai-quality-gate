import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { RULE_NAMES } from '@/constants/rules'

import { diagnoseVueFiles, diagnoseVueSource } from './vueSfcDiagnostics'

const widget = 'Widget.vue'

describe('Vue SFC diagnostics', () => {
  it('accepts a script setup block Vue can compile', () => {
    const source = `<template><p>ok</p></template>
<script setup lang="ts">
const ready = 1
</script>
`

    expect(diagnoseVueSource(widget, source)).toEqual([])
  })

  it('accepts a type export inside script setup', () => {
    const source = `<script setup lang="ts">
export type Id = string
const ready = 1
</script>
`

    expect(diagnoseVueSource(widget, source)).toEqual([])
  })

  it('reports an unclosed script instead of treating the file as clean', () => {
    const source = `<script setup lang="ts">
const _value = 1
`

    const issues = diagnoseVueSource(widget, source)

    expect(issues).toHaveLength(1)
    expect(issues[0]?.rule).toBe(RULE_NAMES.VUE_SFC)
    expect(issues[0]?.message).toMatch(/missing end tag/)
    expect(issues[0]?.line).toBe(1)
  })

  it('reports an export inside script setup', () => {
    const source = `<script setup lang="ts">
export function ready(): number {
  return 1
}
</script>
`

    const issues = diagnoseVueSource(widget, source)

    expect(issues).toHaveLength(1)
    expect(issues[0]?.rule).toBe(RULE_NAMES.VUE_SFC)
    expect(issues[0]?.message).toMatch(/cannot contain ES module exports/)
  })

  it('reports script and script setup blocks that use different languages', () => {
    const source = `<script lang="js">
export const legacy = 1
</script>
<script setup lang="ts">
const ready = 1
</script>
`

    const issues = diagnoseVueSource(widget, source)

    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toMatch(/same language type/)
  })

  it('reports a broken template and does not ignore the script', () => {
    const source = `<template>
  <p>
</template>
<script setup lang="ts">
const ready = 1
</script>
`

    const issues = diagnoseVueSource(widget, source)

    expect(issues.some(issue => issue.rule === RULE_NAMES.VUE_SFC)).toBe(true)
    expect(issues.some(issue => issue.message.includes('missing end tag'))).toBe(true)
  })
})

const propsFrom = (specifier: string): string => `<script setup lang="ts">
import type { Props } from '${specifier}'
const props = defineProps<Props>()
</script>
<template><p>{{ props.label }}</p></template>
`

describe('Vue SFC diagnostics with imported prop types', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-vue-types-'))
    fs.writeFileSync(path.join(dir, 'types.ts'), 'export interface Props {\n  label: string\n  count?: number\n}\n')
  })

  afterEach(() => fs.rmSync(dir, { force: true, recursive: true }))

  it('accepts defineProps typed with an interface imported from a sibling file', () => {
    const file = path.join(dir, 'Widget.vue')

    expect(diagnoseVueSource(file, propsFrom('./types'))).toEqual([])
  })

  it('still reports an imported type that cannot be resolved', () => {
    const file = path.join(dir, 'Widget.vue')
    const issues = diagnoseVueSource(file, propsFrom('./missing'))

    expect(issues).toHaveLength(1)
    expect(issues[0]?.rule).toBe(RULE_NAMES.VUE_SFC)
    expect(issues[0]?.message).toContain('Failed to resolve import source "./missing"')
  })

  it('sees an edit to the imported type file on the next call, not a cached copy', () => {
    const file = path.join(dir, 'Widget.vue')
    const types = path.join(dir, 'types.ts')

    expect(diagnoseVueSource(file, propsFrom('./types'))).toEqual([])

    fs.writeFileSync(types, 'export type Props = string\n')

    const broken = diagnoseVueSource(file, propsFrom('./types'))

    expect(broken).toHaveLength(1)
    expect(broken[0]?.message).toContain('Unresolvable type')

    fs.writeFileSync(types, 'export interface Props {\n  label: string\n}\n')

    expect(diagnoseVueSource(file, propsFrom('./types'))).toEqual([])
  })

  it('sees an edit to a type file the imported type file itself imports', () => {
    const file = path.join(dir, 'Widget.vue')
    const shared = path.join(dir, 'shared.ts')

    fs.writeFileSync(shared, 'export interface Shared {\n  label: string\n}\n')
    fs.writeFileSync(path.join(dir, 'types.ts'), "import type { Shared } from './shared'\nexport type Props = Shared\n")

    expect(diagnoseVueSource(file, propsFrom('./types'))).toEqual([])

    fs.writeFileSync(shared, 'export type Shared = string\n')

    expect(diagnoseVueSource(file, propsFrom('./types'))).toHaveLength(1)
  })
})

describe('diagnoseVueFiles with a file that is not there', () => {
  it('reports it as a finding instead of throwing the file system error', () => {
    const missing = path.join(os.tmpdir(), 'aqg-no-such-dir', 'Missing.vue')

    const issues = diagnoseVueFiles([missing])

    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ rule: RULE_NAMES.VUE_SFC, file: missing, line: 0 })
    expect(issues[0]?.message).toMatch(/^Could not read the file: ENOENT/)
  })

  it('skips paths that are not Vue files', () => {
    expect(diagnoseVueFiles(['/nowhere/a.ts'])).toEqual([])
  })
})
