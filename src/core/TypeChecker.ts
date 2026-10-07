/**
 * The type check: which project compiles each selected file, which checker runs it, and whether the file is in the
 * program at all. A checker passes a file it never looked at without a word, so membership is verified, not assumed.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { isTypeScriptFile, isVueSfc } from '@/constants/extensions'
import { RULE_NAMES } from '@/constants'
import {
  CHECK_STATUS,
  TYPECHECK_CACHE_FILENAME,
  TYPECHECK_CACHE_PREFIX,
  TYPECHECK_FLAG,
  VERIFIER_TOOL_MODULE
} from '@/constants/verification'
import { commandFailureMessage, commandSucceeded, type CommandResult } from '@/core/commandResult'
import { findToolCommand, type ToolModule } from '@/core/toolCommand'
import { missingTsConfigIssues, toolIssue } from '@/core/toolIssue'
import { notCheckedIssue, parseListedFiles } from '@/core/typeCheckCoverage'
import { parseTypeCheckCommand, sameDiagnostic } from '@/core/typeCheckOutput'
import type { Config, Issue, TypeCheckResult } from '@/types'
import { hasPath } from '@/utils/diskPath'
import {
  groupByTypeCheckProject,
  referencedProjects,
  type ParsedConfigCache,
  type ProjectGroup,
  type TypeCheckProject
} from '@/utils/typeCheckProject'
import { hasTypeScriptScript } from '@/vue/scriptLanguages'

/** Runs a Node tool entry point and says how it ended. */
export type RunTool = (
  command: string,
  args: string[],
  options: { cwd: string; timeout: number }
) => Promise<CommandResult>

export class TypeChecker {
  private readonly config: Config
  private readonly runTool: RunTool
  private readonly listings = new Map<string, Promise<ReadonlySet<string>>>()
  private readonly configs: ParsedConfigCache = new Map()

  constructor(config: Config, runTool: RunTool) {
    this.config = config
    this.runTool = runTool
  }

  /**
   * Typecheck has full tsconfig context; lint remains limited to the selected paths.
   * TypeScript files and `.vue` files with a TypeScript script are checked. A plain-JavaScript `.vue` file is
   * not, just as a `.js` file is not.
   */
  async run(files: string[]): Promise<TypeCheckResult> {
    const checkable = files
      .map(file => path.resolve(this.config.projectRoot, file))
      .filter(file => isTypeScriptFile(file) || (isVueSfc(file) && hasTypeScriptScript(file)))
    const missing = checkable.filter(file => !fs.existsSync(file) || !fs.statSync(file).isFile())

    if (missing.length > 0) {
      return {
        passed: false,
        status: CHECK_STATUS.ERROR,
        errors: missing.map(file =>
          toolIssue(RULE_NAMES.TYPESCRIPT, file, new Error('Selected TypeScript source is missing'))
        )
      }
    }

    const { projects, withoutTsConfig } = groupByTypeCheckProject(checkable, this.config.projectRoot, this.configs)
    const errors: Issue[] = missingTsConfigIssues(withoutTsConfig)
    let status: TypeCheckResult['status'] = withoutTsConfig.length > 0 ? CHECK_STATUS.ERROR : CHECK_STATUS.PASS

    await this.placeFilesReachedByImport(projects)

    for (const { project, files: groupFiles } of projects.values()) {
      const result = await this.runGroup(project, groupFiles)

      for (const error of result.errors) {
        if (!errors.some(known => sameDiagnostic(known, error))) errors.push(error)
      }

      if (
        result.status === CHECK_STATUS.ERROR ||
        (status !== CHECK_STATUS.ERROR && result.status === CHECK_STATUS.FAIL)
      ) {
        const { status: resultStatus } = result

        status = resultStatus
      }
    }

    return { passed: status === CHECK_STATUS.PASS, status, errors, checkedProjects: [...projects.keys()] }
  }

  /**
   * A solution-style root compiles nothing itself. A file that no project lists as one of its own can still be in
   * a referenced project's program, because something there imports it. Which one is only known from the checker,
   * so the projects it references are asked, once each.
   */
  private async placeFilesReachedByImport(projects: Map<string, ProjectGroup>): Promise<void> {
    for (const [key, group] of projects) {
      if (group.project.roots.size > 0) continue

      const candidates = referencedProjects(group.project, this.configs)
      const remaining: string[] = []

      for (const file of group.files) {
        const owners = await this.projectsListing(candidates, file)

        for (const owner of owners) {
          const target = projects.get(owner.configPath) ?? { project: owner, files: [] }

          target.files.push(file)
          projects.set(owner.configPath, target)
        }

        if (owners.length === 0) remaining.push(file)
      }

      if (remaining.length === 0) projects.delete(key)
      else group.files.splice(0, group.files.length, ...remaining)
    }
  }

  private async projectsListing(candidates: readonly TypeCheckProject[], file: string): Promise<TypeCheckProject[]> {
    const owners: TypeCheckProject[] = []

    for (const candidate of candidates) {
      if (hasPath(await this.programOf(candidate), file)) owners.push(candidate)
    }

    return owners
  }

  /**
   * A project that compiles `.vue` files needs `vue-tsc`, which also checks the `.ts` files of that program, so it
   * replaces `tsc` there.
   */
  private checkerFor(project: TypeCheckProject, files: readonly string[]): ToolModule {
    const needsVueTsc = project.usesVue || files.some(file => isVueSfc(file))

    return needsVueTsc ? VERIFIER_TOOL_MODULE.VUE_TSC : VERIFIER_TOOL_MODULE.TYPESCRIPT
  }

  private async runGroup(project: TypeCheckProject, groupFiles: string[]): Promise<TypeCheckResult> {
    const projectDir = path.dirname(project.configPath)
    const checker = this.checkerFor(project, groupFiles)
    let cacheDir: string | undefined

    try {
      cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), TYPECHECK_CACHE_PREFIX))
      const command = findToolCommand(projectDir, checker)
      const result = await this.runTool(
        command.command,
        [
          ...command.args,
          TYPECHECK_FLAG.NO_EMIT,
          TYPECHECK_FLAG.INCREMENTAL,
          TYPECHECK_FLAG.BUILD_INFO_FILE,
          path.join(cacheDir, TYPECHECK_CACHE_FILENAME),
          TYPECHECK_FLAG.PRETTY,
          'false',
          TYPECHECK_FLAG.PROJECT,
          project.configPath
        ],
        { cwd: projectDir, timeout: this.config.phase1Timeout }
      )

      const checked = parseTypeCheckCommand(result, groupFiles, project.configPath)
      const unchecked = await this.filesOutsideProgram(project, groupFiles, checker)

      return unchecked.length === 0 ? checked : this.withUncheckedFiles(checked, unchecked)
    } catch (error) {
      return {
        passed: false,
        status: CHECK_STATUS.ERROR,
        errors: [toolIssue(RULE_NAMES.TYPESCRIPT, project.configPath, error)]
      }
    } finally {
      if (cacheDir !== undefined) fs.rmSync(cacheDir, { recursive: true, force: true })
    }
  }

  /**
   * Files that neither the project's own file list nor the files it pulls in through imports contain.
   * The cheap check is the file list; only a file missing from it costs a second, check-free run of the checker.
   */
  private async filesOutsideProgram(
    project: TypeCheckProject,
    groupFiles: string[],
    checker: ToolModule
  ): Promise<Issue[]> {
    const outsideRoots = groupFiles.filter(file => !hasPath(project.roots, file))

    if (outsideRoots.length === 0) return []

    const listed = await this.programOf(project, checker)

    return outsideRoots
      .filter(file => !hasPath(listed, file))
      .map(file => notCheckedIssue(file, project.configPath, this.config.projectRoot, checker.name))
  }

  /** Every file the project's program contains, from the checker. Asked once per project. */
  private programOf(project: TypeCheckProject, checker?: ToolModule): Promise<ReadonlySet<string>> {
    const known = this.listings.get(project.configPath)

    if (known !== undefined) return known

    const listing = this.listProgram(project, checker ?? this.checkerFor(project, []))

    this.listings.set(project.configPath, listing)

    return listing
  }

  private async listProgram(project: TypeCheckProject, checker: ToolModule): Promise<ReadonlySet<string>> {
    const command = findToolCommand(path.dirname(project.configPath), checker)
    const listing = await this.runTool(
      command.command,
      [
        ...command.args,
        TYPECHECK_FLAG.NO_EMIT,
        TYPECHECK_FLAG.LIST_FILES_ONLY,
        TYPECHECK_FLAG.PROJECT,
        project.configPath
      ],
      { cwd: path.dirname(project.configPath), timeout: this.config.phase1Timeout }
    )

    // Without the listing there is no way to say a file was checked, so the check cannot pass it.
    if (!commandSucceeded(listing)) {
      throw new Error(
        `${checker.name} could not list the files of ${project.configPath}: ${commandFailureMessage(listing, checker.name)}`
      )
    }

    return parseListedFiles(listing.stdout)
  }

  private withUncheckedFiles(checked: TypeCheckResult, unchecked: Issue[]): TypeCheckResult {
    return {
      passed: false,
      status: checked.status === CHECK_STATUS.ERROR ? CHECK_STATUS.ERROR : CHECK_STATUS.FAIL,
      errors: [...checked.errors, ...unchecked]
    }
  }
}
