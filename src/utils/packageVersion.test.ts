import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { getPackageVersion } from '@/utils/packageVersion'

describe('getPackageVersion', () => {
  it('reads version from the project package.json', () => {
    const expected = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
      version: string
    }

    expect(getPackageVersion()).toBe(expected.version)
  })

  it("returns '0.0.0' when package.json cannot be read", () => {
    const spy = vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('ENOENT')
    })

    expect(getPackageVersion()).toBe('0.0.0')

    spy.mockRestore()
  })
})
