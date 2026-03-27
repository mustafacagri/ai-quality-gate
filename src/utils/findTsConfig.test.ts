import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { findTsConfig, groupFilesByTsConfig } from '@/utils/findTsConfig'

const writeJson = (filePath: string, data: unknown): void => {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

const makeTempRoot = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-ts-'))

describe('findTsConfig', () => {
  it('resolves nearest tsconfig.json under project root', () => {
    const root = makeTempRoot()

    writeJson(path.join(root, 'tsconfig.json'), { compilerOptions: { strict: true } })
    fs.mkdirSync(path.join(root, 'src'), { recursive: true })

    const file = path.join(root, 'src', 'app.ts')

    fs.writeFileSync(file, '// x', 'utf8')

    const tsconfig = findTsConfig(file, root)

    expect(tsconfig).toBe(path.join(root, 'tsconfig.json'))
  })

  it('prefers nested tsconfig over root when file is under nested package', () => {
    const root = makeTempRoot()

    writeJson(path.join(root, 'tsconfig.json'), { compilerOptions: { strict: false } })

    const nested = path.join(root, 'apps', 'web')

    fs.mkdirSync(path.join(nested, 'src'), { recursive: true })
    writeJson(path.join(nested, 'tsconfig.json'), { compilerOptions: { strict: true } })

    const file = path.join(nested, 'src', 'page.ts')

    fs.writeFileSync(file, '// p', 'utf8')

    const tsconfig = findTsConfig(file, root)

    expect(tsconfig).toBe(path.join(nested, 'tsconfig.json'))
  })

  it('throws when no tsconfig exists under project root', () => {
    const root = makeTempRoot()

    fs.mkdirSync(path.join(root, 'empty'), { recursive: true })

    const file = path.join(root, 'empty', 'orphan.ts')

    fs.writeFileSync(file, '', 'utf8')

    expect(() => findTsConfig(file, root)).toThrow(/tsconfig\.json not found/)
  })
})

describe('groupFilesByTsConfig', () => {
  it('groups files by their nearest tsconfig', () => {
    const root = makeTempRoot()

    writeJson(path.join(root, 'tsconfig.json'), {})

    const pkgA = path.join(root, 'packages', 'a')
    const pkgB = path.join(root, 'packages', 'b')

    fs.mkdirSync(path.join(pkgA, 'src'), { recursive: true })
    fs.mkdirSync(path.join(pkgB, 'src'), { recursive: true })

    writeJson(path.join(pkgA, 'tsconfig.json'), {})
    writeJson(path.join(pkgB, 'tsconfig.json'), {})

    const fileA = path.join(pkgA, 'src', 'a.ts')
    const fileB = path.join(pkgB, 'src', 'b.ts')

    fs.writeFileSync(fileA, '', 'utf8')
    fs.writeFileSync(fileB, '', 'utf8')

    const groups = groupFilesByTsConfig([fileA, fileB], root)

    expect(groups.size).toBe(2)
    expect(groups.get(path.join(pkgA, 'tsconfig.json'))).toEqual([fileA])
    expect(groups.get(path.join(pkgB, 'tsconfig.json'))).toEqual([fileB])
  })

  it('uses __no_tsconfig__ bucket when no tsconfig applies', () => {
    const root = makeTempRoot()

    fs.mkdirSync(path.join(root, 'src'), { recursive: true })

    const file = path.join(root, 'src', 'only.ts')

    fs.writeFileSync(file, '', 'utf8')

    const groups = groupFilesByTsConfig([file], root)

    expect(groups.has('__no_tsconfig__')).toBe(true)
    expect(groups.get('__no_tsconfig__')).toEqual([file])
  })
})
