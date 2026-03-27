/**
 * Ensures embedded Phase 1 ESLint config reports core fixable rules (v2.1.0).
 */

import { ESLint } from 'eslint'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { resolveEmbeddedEslintConfigPath } from '@/utils/embeddedEslintConfigPath'

describe('embedded ESLint config (v2.1.0 rules)', () => {
  let tmpDir: string | undefined

  afterEach(() => {
    if (tmpDir !== undefined) {
      fs.rmSync(tmpDir, { force: true, recursive: true })
      tmpDir = undefined
    }
  })

  it('flags no-var, eqeqeq, and prefer-const on a fixture file', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-eslint-v21-'))

    fs.writeFileSync(
      path.join(tmpDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          noEmit: true,
          strict: true,
          target: 'ES2022'
        },
        include: ['*.ts']
      })
    )

    const badSource = `var x = 1
let y = 2
if (x == y) {
  console.log(x)
}
`

    fs.writeFileSync(path.join(tmpDir, 'bad.ts'), badSource)

    // `no-restricted-syntax` uses an esquery selector that can throw on some ESLint/esquery
    // versions when linting minimal files; v2.1.0 rules are independent of that rule.
    const eslint = new ESLint({
      cwd: tmpDir,
      overrideConfig: [
        {
          rules: {
            'no-restricted-syntax': 'off'
          }
        }
      ],
      overrideConfigFile: resolveEmbeddedEslintConfigPath()
    })

    const results = await eslint.lintFiles(['bad.ts'])
    const messages = results.flatMap(r => r.messages)
    const ruleIds = new Set(messages.map(m => m.ruleId).filter(Boolean))

    expect(ruleIds.has('no-var')).toBe(true)
    expect(ruleIds.has('eqeqeq')).toBe(true)
    expect(ruleIds.has('prefer-const')).toBe(true)
  })
})
