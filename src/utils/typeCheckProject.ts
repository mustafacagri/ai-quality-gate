/**
 * Pick the tsconfig a file is really compiled by.
 * The nearest `tsconfig.json` of a create-vue style project only lists `references`, compiles nothing itself,
 * and passes any file silently. The project that includes the file is one of its references.
 */

import fs from 'node:fs'
import path from 'node:path'

import * as ts from 'typescript'

import { VUE_SFC_EXTENSION, isVueSfc } from '@/constants/extensions'
import { PACKAGE_JSON } from '@/constants/project-root'
import { hasPath } from '@/utils/diskPath'
import { findTsConfig } from '@/utils/findTsConfig'

const VUE_PACKAGE = 'vue'
const VUE_DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'] as const

/** A chain of references deeper than this is not followed. */
const MAX_REFERENCE_DEPTH = 5

/** Lets the TypeScript API match `.vue` files for wildcard `include` patterns, as `vue-tsc` does. */
const VUE_EXTRA_EXTENSIONS: readonly ts.FileExtensionInfo[] = [
  { extension: VUE_SFC_EXTENSION.slice(1), isMixedContent: true, scriptKind: ts.ScriptKind.Deferred }
]

export interface TypeCheckProject {
  readonly configPath: string
  /** Files the config lists or includes itself, as absolute paths. */
  readonly roots: ReadonlySet<string>
  /** True when the config compiles at least one `.vue` file, so `vue-tsc` is the right checker. */
  readonly usesVue: boolean
}

interface ParsedConfig {
  readonly configPath: string
  readonly roots: ReadonlySet<string>
  readonly references: readonly string[]
}

export type ParsedConfigCache = Map<string, ParsedConfig | undefined>

const parseConfig = (configPath: string): ParsedConfig | undefined => {
  const read = ts.readConfigFile(configPath, file => ts.sys.readFile(file))

  if (read.error !== undefined) return undefined

  // Diagnostics such as an empty `files` list are expected for a solution config and do not matter here.
  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    path.dirname(configPath),
    undefined,
    configPath,
    undefined,
    [...VUE_EXTRA_EXTENSIONS]
  )

  return {
    configPath,
    roots: new Set(parsed.fileNames.map(name => path.resolve(name))),
    references: (parsed.projectReferences ?? []).map(reference => ts.resolveProjectReferencePath(reference))
  }
}

const parseCached = (configPath: string, cache: ParsedConfigCache): ParsedConfig | undefined => {
  if (!cache.has(configPath)) cache.set(configPath, parseConfig(configPath))

  return cache.get(configPath)
}

/**
 * Depth-first over `references`, collecting every project that includes the file.
 * `chain` holds the configs on the current path, so a loop ends the walk.
 */
const findCoveringConfigs = (
  configPath: string,
  target: string,
  cache: ParsedConfigCache,
  chain: readonly string[]
): string[] => {
  if (chain.includes(configPath) || chain.length > MAX_REFERENCE_DEPTH) return []

  const config = parseCached(configPath, cache)

  if (config === undefined) return []

  // A project that includes the file may reference another that includes it too. Its program uses that one's
  // declaration output, not its source, so the referenced project has to be checked as well.
  const own = hasPath(config.roots, target) ? [configPath] : []
  const referenced = config.references.flatMap(reference =>
    findCoveringConfigs(reference, target, cache, [...chain, configPath])
  )

  return [...own, ...referenced]
}

/** The nearest `package.json` above the config lists `vue` among its dependencies. */
const declaresVue = (configPath: string): boolean => {
  for (let directory = path.dirname(configPath); ; directory = path.dirname(directory)) {
    const manifest = path.join(directory, PACKAGE_JSON)

    if (fs.existsSync(manifest)) return manifestDeclaresVue(manifest)

    if (path.dirname(directory) === directory) return false
  }
}

const manifestDeclaresVue = (manifest: string): boolean => {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(manifest, 'utf8'))

    if (typeof parsed !== 'object' || parsed === null) return false

    return VUE_DEPENDENCY_FIELDS.some(field => {
      const dependencies: unknown = Reflect.get(parsed, field)

      return typeof dependencies === 'object' && dependencies !== null && Reflect.has(dependencies, VUE_PACKAGE)
    })
  } catch {
    return false
  }
}

const describeProject = (configPath: string, cache: ParsedConfigCache): TypeCheckProject => {
  const roots = parseCached(configPath, cache)?.roots ?? new Set<string>()
  const compilesVue = [...roots].some(root => isVueSfc(root))

  // A TypeScript file that only imports a `.vue` module is in a program with no `.vue` root. `tsc` cannot
  // resolve that import, `vue-tsc` can, so a project that depends on `vue` is checked with `vue-tsc`.
  return { configPath, roots, usesVue: compilesVue || declaresVue(configPath) }
}

/**
 * Every project reachable through `references` from this one that lists files of its own. A solution-style root
 * lists none; its programs are these.
 */
export const referencedProjects = (project: TypeCheckProject, cache: ParsedConfigCache): TypeCheckProject[] => {
  const reached = new Map<string, TypeCheckProject>()
  const visit = (configPath: string, depth: number): void => {
    if (depth > MAX_REFERENCE_DEPTH) return

    for (const reference of parseCached(configPath, cache)?.references ?? []) {
      if (reached.has(reference) || reference === project.configPath) continue

      const described = describeProject(reference, cache)

      if (described.roots.size > 0) reached.set(reference, described)

      visit(reference, depth + 1)
    }
  }

  visit(project.configPath, 0)

  return [...reached.values()]
}

/**
 * Every project the file is compiled by. Two referenced projects can include the same file with different
 * strictness, and each one's verdict counts.
 *
 * @throws Error when no `tsconfig.json` is found for the file.
 * @returns The projects that include the file, or the nearest `tsconfig.json` alone when none does.
 */
export const resolveTypeCheckProjects = (
  file: string,
  projectRoot: string,
  cache: ParsedConfigCache = new Map()
): TypeCheckProject[] => {
  const nearest = findTsConfig(file, projectRoot)
  const covering = [...new Set(findCoveringConfigs(nearest, path.resolve(file), cache, []))]
  const configPaths = covering.length > 0 ? covering : [nearest]

  return configPaths.map(configPath => describeProject(configPath, cache))
}

export interface ProjectGroup {
  readonly project: TypeCheckProject
  readonly files: string[]
}

/**
 * Files grouped by the project that compiles them, one group per tsconfig. A file that several projects include is
 * in each of their groups. A file no tsconfig can be found for is listed apart.
 */
export const groupByTypeCheckProject = (
  files: readonly string[],
  projectRoot: string,
  cache: ParsedConfigCache = new Map()
): { projects: Map<string, ProjectGroup>; withoutTsConfig: string[] } => {
  const projects = new Map<string, ProjectGroup>()
  const withoutTsConfig: string[] = []

  for (const file of files) {
    try {
      for (const project of resolveTypeCheckProjects(file, projectRoot, cache)) {
        const group = projects.get(project.configPath) ?? { project, files: [] }

        group.files.push(file)
        projects.set(project.configPath, group)
      }
    } catch {
      withoutTsConfig.push(file)
    }
  }

  return { projects, withoutTsConfig }
}
