import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { RULE_NAMES } from '@/constants/rules'
import { TransactionManager } from '@/core/TransactionManager'
import { Phase1Local } from '@/phases/Phase1Local'
import { DEFAULT_FIXER_CONFIG, type Config, type FixSummary } from '@/types'

describe('Phase1Local', () => {
  it('returns success when only JSON files are present and validation passes', async () => {
    const config: Config = {
      projectRoot: process.cwd(),
      phase1Timeout: 120_000,
      phase2Timeout: 300_000,
      enableI18nRules: false,
      fixers: { ...DEFAULT_FIXER_CONFIG }
    }
    const phase1 = new Phase1Local(config)
    const tm = new TransactionManager()
    const tx = tm.begin()

    const result = await phase1.run([path.join(process.cwd(), 'package.json')], tx, { phase1Mode: 'check' })

    expect(result.passed).toBe(true)
  }, 120_000)

  it('hands out the summary it keeps filling in, so edits survive a later throw', async () => {
    const config: Config = {
      projectRoot: process.cwd(),
      phase1Timeout: 120_000,
      phase2Timeout: 300_000,
      enableI18nRules: false,
      fixers: { ...DEFAULT_FIXER_CONFIG }
    }
    const handedOut: FixSummary[] = []

    const result = await new Phase1Local(config).run(
      [path.join(process.cwd(), 'package.json')],
      new TransactionManager().begin(),
      {
        phase1Mode: 'check',
        onFixSummary: summary => handedOut.push(summary)
      }
    )

    expect(handedOut).toHaveLength(1)
    expect(handedOut[0]).toBe(result.fixed)
  }, 120_000)

  it('carries what it could not apply in its result, and resets it for the next run', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-phase1-warnings-'))
    const file = path.join(dir, 'a.js')

    fs.writeFileSync(file, 'export const a = 1\n', 'utf8')

    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const config: Config = {
      projectRoot: process.cwd(),
      phase1Timeout: 120_000,
      phase2Timeout: 300_000,
      enableI18nRules: false,
      fixers: { ...DEFAULT_FIXER_CONFIG, eslint: false },
      customRules: [{ id: 'broken', message: 'm', pattern: '(', severity: 'error' }]
    }
    const phase1 = new Phase1Local(config)

    try {
      const first = await phase1.run([file], new TransactionManager().begin(), { phase1Mode: 'check' })

      expect(first.passed).toBe(true)
      expect(first.warnings).toEqual([
        'Custom rule "broken" was not applied: its pattern is not a valid regular expression.'
      ])

      const second = await phase1.run([file], new TransactionManager().begin(), { phase1Mode: 'check' })

      expect(second.warnings).toHaveLength(1)

      const overlapping = await Promise.all([
        phase1.run([file], new TransactionManager().begin(), { phase1Mode: 'check' }),
        phase1.run([file], new TransactionManager().begin(), { phase1Mode: 'check' })
      ])

      expect(overlapping.map(result => result.warnings)).toEqual([
        [expect.stringContaining('"broken"')],
        [expect.stringContaining('"broken"')]
      ])
    } finally {
      err.mockRestore()
      fs.rmSync(dir, { force: true, recursive: true })
    }
  }, 120_000)

  it('fails a structurally invalid Vue file before rewriting it', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-phase1-vue-'))
    const file = path.join(dir, 'Broken.vue')
    const source = `<script setup lang="ts">
const _value = 1
`
    fs.writeFileSync(file, source, 'utf8')

    try {
      const config: Config = {
        projectRoot: process.cwd(),
        phase1Timeout: 30_000,
        phase2Timeout: 300_000,
        enableI18nRules: false,
        fixers: { ...DEFAULT_FIXER_CONFIG }
      }
      const phase1 = new Phase1Local(config)
      const tx = new TransactionManager().begin()
      const result = await phase1.run([file], tx)

      expect(result.passed).toBe(false)
      expect(result.issues.some(issue => issue.rule === RULE_NAMES.VUE_SFC)).toBe(true)
      expect(fs.readFileSync(file, 'utf8')).toBe(source)
    } finally {
      fs.rmSync(dir, { force: true, recursive: true })
    }
  })
})
