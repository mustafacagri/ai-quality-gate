import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { ESLint } from 'eslint'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resolveEmbeddedEslintConfigPath } from '@/utils/embeddedEslintConfigPath'

let projectRoot: string
let eslint: ESLint
beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-embedded-contract-'))
  fs.writeFileSync(
    path.join(projectRoot, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { target: 'ES2022', strict: true, noEmit: true }, include: ['**/*'] })
  )
  eslint = new ESLint({ cwd: projectRoot, overrideConfigFile: resolveEmbeddedEslintConfigPath() })
})
afterEach(() => fs.rmSync(projectRoot, { recursive: true, force: true }))

async function messagesFor(name: string, source: string) {
  fs.writeFileSync(path.join(projectRoot, name), source)
  const results = await eslint.lintFiles([name])

  return results.flatMap(result => result.messages)
}

describe('shipped configuration release contract', () => {
  it.each([
    ['ordinary', "import { readFileSync } from 'node:fs'\nexport const content = readFileSync\n", false],
    ['multiline alias', "import {\n readFileSync as read\n} from 'node:fs'\nexport const content = read\n", true],
    ['type alias', "import type { Stats as Details } from 'node:fs'\nexport declare const content: Details\n", true],
    [
      'inline type alias',
      "import { type Stats as Details } from 'node:fs'\nexport declare const content: Details\n",
      true
    ],
    ['ordinary type', "import type { Stats } from 'node:fs'\nexport declare const content: Stats\n", false]
  ])('compares named import AST values: %s', async (_name, source, aliased) => {
    const messages = await messagesFor('named.ts', source)
    expect(messages.some(message => message.fatal)).toBe(false)
    expect(messages.some(message => message.ruleId === 'aqg/no-import-alias')).toBe(aliased)
  })

  it.each(['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts'])(
    'reports an applicable violation in .%s',
    async extension => {
      const messages = await messagesFor(`selected.${extension}`, 'var value = 1\nif (value == 2) console.log(value)\n')
      expect(messages.some(message => message.fatal)).toBe(false)
      expect(messages.some(message => message.ruleId === 'eqeqeq')).toBe(true)
    }
  )

  it('analyzes declaration and executable config sources', async () => {
    const declaration = await messagesFor('external.d.ts', 'export declare const external: any\n')
    expect(declaration.some(message => message.ruleId === '@typescript-eslint/no-explicit-any')).toBe(true)
    const config = await messagesFor('runtime.config.cjs', 'module.exports = { ready: 1 == 2 }\n')
    expect(config.some(message => message.ruleId === 'eqeqeq')).toBe(true)
  })

  it('uses real type information for floating promises and unsafe values', async () => {
    const floating = await messagesFor('floating.ts', 'export function dispatch(): void { Promise.resolve(true) }\n')
    expect(floating.some(message => message.ruleId === '@typescript-eslint/no-floating-promises')).toBe(true)
    const unsafe = await messagesFor(
      'unsafe.ts',
      'declare function read(): any\nexport const payload: string = read()\n'
    )
    expect(unsafe.some(message => message.ruleId === '@typescript-eslint/no-unsafe-assignment')).toBe(true)
    const clean = await messagesFor('clean.ts', 'export const READY = true\n')
    expect(clean).toEqual([])
  })
})
