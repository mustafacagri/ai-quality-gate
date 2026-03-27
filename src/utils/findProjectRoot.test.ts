import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { findProjectRoot } from '@/utils/findProjectRoot'

const makeTempDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-proot-'))

describe('findProjectRoot', () => {
  it('returns the directory that contains package.json when starting from that directory', () => {
    const root = makeTempDir()

    fs.writeFileSync(path.join(root, 'package.json'), '{}', 'utf8')

    expect(findProjectRoot(root)).toBe(path.resolve(root))
  })

  it('returns the nearest ancestor that contains package.json when starting from a subfolder', () => {
    const root = makeTempDir()
    const sub = path.join(root, 'packages', 'app')

    fs.mkdirSync(sub, { recursive: true })
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"root"}', 'utf8')

    expect(findProjectRoot(sub)).toBe(path.resolve(root))
  })

  it('returns the directory that contains tsconfig.json when no package.json exists', () => {
    const root = makeTempDir()

    fs.writeFileSync(path.join(root, 'tsconfig.json'), '{}', 'utf8')

    expect(findProjectRoot(root)).toBe(path.resolve(root))
  })

  it('prefers the nearest marker when walking up from a nested path', () => {
    const root = makeTempDir()
    const pkg = path.join(root, 'inner')

    fs.mkdirSync(pkg, { recursive: true })
    fs.writeFileSync(path.join(root, 'package.json'), '{}', 'utf8')
    fs.writeFileSync(path.join(pkg, 'package.json'), '{"name":"inner"}', 'utf8')

    expect(findProjectRoot(pkg)).toBe(path.resolve(pkg))
  })

  it('falls back to startDir when no marker exists anywhere upward', () => {
    const dir = makeTempDir()

    expect(findProjectRoot(dir)).toBe(path.resolve(dir))
  })
})
