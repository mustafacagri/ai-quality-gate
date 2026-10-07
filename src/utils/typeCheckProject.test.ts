import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { referencedProjects, resolveTypeCheckProjects, type ParsedConfigCache } from '@/utils/typeCheckProject'

const resolveTypeCheckProject = (
  ...args: Parameters<typeof resolveTypeCheckProjects>
): ReturnType<typeof resolveTypeCheckProjects>[number] => {
  const [first, ...rest] = resolveTypeCheckProjects(...args)

  if (first === undefined || rest.length > 0) throw new Error('expected exactly one project')

  return first
}

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'aqg-type-project-'))
})

afterEach(() => fs.rmSync(root, { force: true, recursive: true }))

const write = (name: string, content: string): string => {
  const file = path.join(root, name)

  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content, 'utf8')

  return file
}

const writeJson = (name: string, value: object): string => write(name, JSON.stringify(value))

/** The layout `create-vue` generates: a root config that only references the real ones. */
const solutionStyleProject = (): void => {
  writeJson('tsconfig.json', {
    files: [],
    references: [{ path: './tsconfig.node.json' }, { path: './tsconfig.app.json' }]
  })
  writeJson('tsconfig.app.json', {
    include: ['env.d.ts', 'src/**/*', 'src/**/*.vue'],
    compilerOptions: { composite: true }
  })
  writeJson('tsconfig.node.json', { include: ['vite.config.*'], compilerOptions: { composite: true } })
  write('env.d.ts', 'export {}\n')
}

describe('resolveTypeCheckProject', () => {
  it('uses the nearest tsconfig when it compiles the file itself', () => {
    const config = writeJson('tsconfig.json', { include: ['src/**/*'] })
    const file = write('src/a.ts', 'export const a = 1\n')

    const project = resolveTypeCheckProject(file, root)

    expect(project.configPath).toBe(config)
    expect(project.roots.has(file)).toBe(true)
    expect(project.usesVue).toBe(false)
  })

  it('finds the referenced project that includes a TypeScript file', () => {
    solutionStyleProject()
    const file = write('src/main.ts', 'export const main = 1\n')
    const vite = write('vite.config.ts', 'export default {}\n')

    expect(resolveTypeCheckProject(file, root).configPath).toBe(path.join(root, 'tsconfig.app.json'))
    expect(resolveTypeCheckProject(vite, root).configPath).toBe(path.join(root, 'tsconfig.node.json'))
  })

  it('matches a .vue file through a wildcard include and reports that the project uses Vue', () => {
    solutionStyleProject()
    const widget = write('src/components/Widget.vue', '<script setup lang="ts">\nconst a = 1\n</script>\n')

    const project = resolveTypeCheckProject(widget, root)

    expect(project.configPath).toBe(path.join(root, 'tsconfig.app.json'))
    expect(project.roots.has(widget)).toBe(true)
    expect(project.usesVue).toBe(true)
  })

  it('falls back to the nearest tsconfig when no project includes the file', () => {
    solutionStyleProject()
    const stray = write('scripts/stray.ts', 'export const stray = 1\n')

    const project = resolveTypeCheckProject(stray, root)

    expect(project.configPath).toBe(path.join(root, 'tsconfig.json'))
    expect(project.roots.has(stray)).toBe(false)
  })

  it('stops following references that loop back', () => {
    writeJson('tsconfig.json', { files: [], references: [{ path: './tsconfig.a.json' }] })
    writeJson('tsconfig.a.json', { files: [], references: [{ path: './tsconfig.json' }] })
    const file = write('src/a.ts', 'export const a = 1\n')

    expect(resolveTypeCheckProject(file, root).configPath).toBe(path.join(root, 'tsconfig.json'))
  })

  it('finds the project even when many sibling references come first', () => {
    const names = Array.from({ length: 10 }, (_unused, index) => `tsconfig.p${String(index)}.json`)

    writeJson('tsconfig.json', { files: [], references: names.map(name => ({ path: `./${name}` })) })

    for (const [index, name] of names.entries()) writeJson(name, { include: [`pkg${String(index)}/**/*`] })

    const file = write('pkg9/src/a.ts', 'export const a = 1\n')

    expect(resolveTypeCheckProject(file, root).configPath).toBe(path.join(root, 'tsconfig.p9.json'))
  })

  it('returns every project that includes the file when two of them overlap', () => {
    writeJson('tsconfig.json', {
      files: [],
      references: [{ path: './tsconfig.loose.json' }, { path: './tsconfig.strict.json' }]
    })
    writeJson('tsconfig.loose.json', { include: ['src/**/*'], compilerOptions: { strict: false } })
    writeJson('tsconfig.strict.json', { include: ['src/**/*'], compilerOptions: { strict: true } })
    const file = write('src/a.ts', 'export const a = 1\n')

    const projects = resolveTypeCheckProjects(file, root)

    expect(projects.map(project => path.basename(project.configPath))).toEqual([
      'tsconfig.loose.json',
      'tsconfig.strict.json'
    ])
  })

  it('returns a project reached through two reference paths once', () => {
    writeJson('tsconfig.json', {
      files: [],
      references: [{ path: './tsconfig.a.json' }, { path: './tsconfig.b.json' }]
    })
    writeJson('tsconfig.a.json', { files: [], references: [{ path: './tsconfig.leaf.json' }] })
    writeJson('tsconfig.b.json', { files: [], references: [{ path: './tsconfig.leaf.json' }] })
    writeJson('tsconfig.leaf.json', { include: ['src/**/*'] })
    const file = write('src/a.ts', 'export const a = 1\n')

    expect(resolveTypeCheckProjects(file, root).map(project => path.basename(project.configPath))).toEqual([
      'tsconfig.leaf.json'
    ])
  })

  it('throws when there is no tsconfig at all', () => {
    const file = write('src/a.ts', 'export const a = 1\n')

    expect(() => resolveTypeCheckProjects(file, root)).toThrow('tsconfig.json not found')
  })

  it('reads each config once for many files when given a cache', () => {
    solutionStyleProject()
    const cache: ParsedConfigCache = new Map()

    resolveTypeCheckProject(write('src/a.ts', 'export const a = 1\n'), root, cache)
    resolveTypeCheckProject(write('src/b.ts', 'export const b = 1\n'), root, cache)

    expect([...cache.keys()].map(key => path.basename(key)).sort((l, r) => l.localeCompare(r))).toEqual([
      'tsconfig.app.json',
      'tsconfig.json',
      'tsconfig.node.json'
    ])
  })
})

describe('a project that includes the file and also references one that does', () => {
  it("returns both, because its own program uses the referenced one's declarations, not its source", () => {
    writeJson('tsconfig.json', { include: ['src/**/*'], references: [{ path: './tsconfig.strict.json' }] })
    writeJson('tsconfig.strict.json', { include: ['src/**/*'], compilerOptions: { composite: true, strict: true } })
    const file = write('src/shared.ts', 'export const shared = 1\n')

    expect(resolveTypeCheckProjects(file, root).map(project => path.basename(project.configPath))).toEqual([
      'tsconfig.json',
      'tsconfig.strict.json'
    ])
  })

  it('returns only the own project when the referenced one does not include the file', () => {
    writeJson('tsconfig.json', { include: ['src/**/*'], references: [{ path: './lib' }] })
    writeJson('lib/tsconfig.json', { include: ['**/*'], compilerOptions: { composite: true } })
    const file = write('src/app.ts', 'export const app = 1\n')

    expect(resolveTypeCheckProjects(file, root).map(project => path.relative(root, project.configPath))).toEqual([
      'tsconfig.json'
    ])
  })
})

describe('referencedProjects', () => {
  it('lists the projects with files of their own that a solution root reaches, through nested solutions too', () => {
    writeJson('tsconfig.json', { files: [], references: [{ path: './mid.json' }, { path: './tsconfig.node.json' }] })
    writeJson('mid.json', { files: [], references: [{ path: './tsconfig.app.json' }] })
    writeJson('tsconfig.app.json', { include: ['src/**/*'] })
    writeJson('tsconfig.node.json', { include: ['vite.config.*'] })
    write('src/main.ts', 'export const main = 1\n')
    write('vite.config.ts', 'export default {}\n')

    const cache: ParsedConfigCache = new Map()
    const [root0] = resolveTypeCheckProjects(path.join(root, 'src', 'main.ts'), root, cache)
    const solution = { configPath: path.join(root, 'tsconfig.json'), roots: new Set<string>(), usesVue: false }

    expect(root0).toBeDefined()
    expect(
      referencedProjects(solution, cache)
        .map(project => path.basename(project.configPath))
        .sort((left, right) => left.localeCompare(right))
    ).toEqual(['tsconfig.app.json', 'tsconfig.node.json'])
  })

  it('does not follow a reference loop forever', () => {
    writeJson('tsconfig.json', { files: [], references: [{ path: './a.json' }] })
    writeJson('a.json', { include: ['*.ts'], references: [{ path: './tsconfig.json' }] })
    write('x.ts', 'export const x = 1\n')

    const solution = { configPath: path.join(root, 'tsconfig.json'), roots: new Set<string>(), usesVue: false }

    expect(referencedProjects(solution, new Map()).map(project => path.basename(project.configPath))).toEqual([
      'a.json'
    ])
  })
})

describe('whether a project uses vue-tsc', () => {
  it.each([
    ['dependencies', { dependencies: { vue: '^3' } }, true],
    ['devDependencies', { devDependencies: { vue: '^3' } }, true],
    ['peerDependencies', { peerDependencies: { vue: '^3' } }, true],
    ['no vue', { dependencies: { react: '^19' } }, false],
    ['vue-tsc alone, which only a tool of this package brings', { devDependencies: { 'vue-tsc': '^3' } }, false]
  ])('reads %s from the nearest package.json', (_name, manifest, expected) => {
    writeJson('package.json', manifest)
    writeJson('tsconfig.json', { include: ['src/**/*.ts'] })
    const file = write('src/a.ts', 'export const a = 1\n')

    expect(resolveTypeCheckProjects(file, root)[0]?.usesVue).toBe(expected)
  })

  it('is false when there is no package.json or it cannot be read', () => {
    write('package.json', '{ not json')
    writeJson('tsconfig.json', { include: ['src/**/*.ts'] })
    const file = write('src/a.ts', 'export const a = 1\n')

    expect(resolveTypeCheckProjects(file, root)[0]?.usesVue).toBe(false)
  })
})
