/**
 * QualityGate - Main Orchestrator
 * Coordinates Phase 1 (Local) and Phase 2 (Server)
 *
 * Flow:
 * 1. Run Phase 1 (always)
 * 2. If Phase 1 fails → return immediately (fail-fast)
 * 3. If Phase 1 passes + Phase 2 configured → run Phase 2
 * 4. Return combined results
 */

import path from 'node:path'
import type {
  Config,
  QualityFixResponse,
  FixSummary,
  Phase,
  Issue,
  Transaction,
  ErrorCode,
  LocalResult,
  ServerResult,
  Phase1RunOptions,
  QualityGatePhases,
  QualityGateRunOptions,
  QualityError,
  Timing
} from '@/types'
import { PHASE, UNKNOWN_ISSUE_LINE } from '@/constants'
import { ERROR_CODE } from '@/constants/errors'
import { TransactionManager } from '@/core/TransactionManager'
import {
  buildResponse,
  errorSummary,
  failureResponse,
  formatDuration,
  qualityErrorFrom,
  type ResponseInput
} from '@/core/responses'
import { countEdits, emptyFixSummary } from '@/utils/fixSummary'
import { selectIssuesOnRestoredFiles } from '@/core/restoredIssues'
import { keptEditsMessage, keptEditsNotice, summarizePhase1Failure } from '@/core/phase1Summary'
import { Phase1Local, Phase2Server } from '@/phases'

/** Optional overrides for tests (transaction + phase runners) */
export interface QualityGateDeps {
  transactionManager?: TransactionManager
  phase1?: {
    run: (files: string[], transaction: Transaction, options?: Phase1RunOptions) => Promise<LocalResult>
  }
  phase2?: { run: (files: string[]) => Promise<ServerResult>; isConfigured: () => boolean }
}

interface RunContext {
  startTime: number
  phase1Time: number
  phase2Time: number
  transaction: Transaction
  absoluteFiles: string[]
  /** Edits Phase 1 made so far. Used when Phase 1 or a later phase throws after those edits. */
  lastEdits: FixSummary
  /** `warnings` of the Phase 1 result, added to whatever response the run ends with. */
  warnings: string[]
  /** The phase that is running, so an error is reported against the phase it happened in. */
  activePhase: Phase
}

interface PhaseResult {
  passed: boolean
  fixed: FixSummary
  issues: Issue[]
  checks?: LocalResult['checks']
}

export class QualityGate {
  private readonly config: Config
  private readonly transactionManager: TransactionManager
  private readonly phase1: {
    run: (files: string[], transaction: Transaction, options?: Phase1RunOptions) => Promise<LocalResult>
  }
  private readonly phase2: {
    run: (files: string[]) => Promise<ServerResult>
    isConfigured: () => boolean
  }

  constructor(config: Config, deps?: QualityGateDeps) {
    this.config = config
    this.transactionManager = deps?.transactionManager ?? new TransactionManager()
    this.phase1 = deps?.phase1 ?? new Phase1Local(config)
    this.phase2 = deps?.phase2 ?? new Phase2Server(config)
  }

  /**
   * Run quality gate on specified files
   * @param options.phases `phase1` | `phase2` | `all` (default). `phase1Mode` defaults to `fix`.
   */
  async run(files: string[], options?: QualityGateRunOptions): Promise<QualityFixResponse> {
    const ctx = this.createContext(files)

    const response = await this.executePhases(ctx, options).catch((error: unknown) => this.handleError(error, ctx))

    if (ctx.warnings.length > 0) response.warnings = ctx.warnings

    return response
  }

  private createContext(files: string[]): RunContext {
    return {
      startTime: Date.now(),
      phase1Time: 0,
      phase2Time: 0,
      transaction: this.transactionManager.begin(),
      absoluteFiles: files.map(file => (path.isAbsolute(file) ? file : path.resolve(this.config.projectRoot, file))),
      lastEdits: emptyFixSummary(),
      warnings: [],
      activePhase: PHASE.LOCAL
    }
  }

  private executePhases(ctx: RunContext, options?: QualityGateRunOptions): Promise<QualityFixResponse> {
    const phases = options?.phases ?? 'all'
    const phase1Mode = options?.phase1Mode ?? 'fix'
    const phase1Opts: Phase1RunOptions = { phase1Mode }

    if (phases === 'phase2') return this.runPhase2OnlyPipeline(ctx)

    return this.runPhase1Pipeline(ctx, phase1Opts, phases)
  }

  private emptyPhaseResult(passed: boolean): PhaseResult {
    return { passed, fixed: emptyFixSummary(), issues: [] }
  }

  private async runPhase2OnlyPipeline(ctx: RunContext): Promise<QualityFixResponse> {
    if (!this.phase2.isConfigured()) {
      return this.buildConfigurationFailureResponse(ctx, 'Phase 2 is not configured (SonarQube env or config missing).')
    }

    const serverResult = await this.runServerPhase(ctx)

    if (!serverResult.passed) {
      const rollbackResponse = await this.tryRollback(ctx, { phase: PHASE.SERVER, issues: serverResult.issues })

      if (rollbackResponse) return rollbackResponse

      return this.buildFailResponse(
        ctx,
        PHASE.SERVER,
        this.phase2FailureMessage(serverResult),
        this.emptyPhaseResult(false),
        { remaining: serverResult.issues, qualityError: serverResult.phaseError }
      )
    }

    await ctx.transaction.commit()

    return this.buildSuccessResponse(
      ctx,
      PHASE.COMPLETE,
      '✅ Phase 2 (SonarQube) checks passed.',
      this.emptyPhaseResult(true)
    )
  }

  private async runPhase1Pipeline(
    ctx: RunContext,
    phase1Opts: Phase1RunOptions,
    phases: QualityGatePhases
  ): Promise<QualityFixResponse> {
    const localResult = await this.runLocalPhase(ctx, phase1Opts)

    ctx.lastEdits = localResult.fixed
    ctx.warnings = localResult.warnings ?? []

    if (!localResult.passed && localResult.keepEdits === true) return this.keepEditsAndReport(ctx, localResult)

    if (!localResult.passed) {
      const rollbackResponse = await this.tryRollback(ctx, { phase: PHASE.LOCAL, issues: localResult.issues })

      if (rollbackResponse) return rollbackResponse

      const remaining = await this.issuesOnRestoredFiles(ctx, localResult)
      const failOptions: { remaining: Issue[]; qualityError?: QualityError } = { remaining }

      if (localResult.phaseError !== undefined) failOptions.qualityError = localResult.phaseError

      return this.buildFailResponse(
        ctx,
        PHASE.LOCAL,
        summarizePhase1Failure(remaining, this.config.projectRoot),
        localResult,
        failOptions
      )
    }

    if (phases === 'phase1') {
      await ctx.transaction.commit()

      return this.buildSuccessResponse(ctx, PHASE.LOCAL, '✅ Phase 1 complete (Phase 2 skipped).', localResult)
    }

    if (!this.phase2.isConfigured()) {
      await ctx.transaction.commit()

      return this.buildSuccessResponse(ctx, PHASE.LOCAL, '✅ Local checks passed (Phase 2 not configured)', localResult)
    }

    return this.runPhase2WithLocal(ctx, localResult)
  }

  /**
   * Phase 1 found things the fixers cannot fix, but the edits it made are valid. They stay on disk, so `fixed`
   * counts them and every `remaining` line number refers to the files as they are now. Phase 2 does not run.
   */
  private async keepEditsAndReport(ctx: RunContext, localResult: PhaseResult): Promise<QualityFixResponse> {
    await ctx.transaction.commit()

    return this.respond(ctx, {
      phase: PHASE.LOCAL,
      success: false,
      message: keptEditsMessage(localResult.issues, this.config.projectRoot, countEdits(localResult.fixed)),
      fixed: localResult.fixed,
      remaining: localResult.issues,
      checks: localResult.checks
    })
  }

  /** Phase 1, with its time kept even when it throws. */
  private async runLocalPhase(ctx: RunContext, options: Phase1RunOptions): Promise<LocalResult> {
    const start = Date.now()

    try {
      return await this.phase1.run(ctx.absoluteFiles, ctx.transaction, {
        ...options,
        onFixSummary: summary => {
          ctx.lastEdits = summary
        }
      })
    } finally {
      ctx.phase1Time = Date.now() - start
    }
  }

  /** Phase 2, with its time kept even when it throws. */
  private async runServerPhase(ctx: RunContext): Promise<ServerResult> {
    const start = Date.now()

    ctx.activePhase = PHASE.SERVER

    try {
      return await this.phase2.run(ctx.absoluteFiles)
    } finally {
      ctx.phase2Time = Date.now() - start
    }
  }

  private async runPhase2WithLocal(ctx: RunContext, localResult: PhaseResult): Promise<QualityFixResponse> {
    const serverResult = await this.runServerPhase(ctx)

    if (!serverResult.passed) return this.keepEditsAfterServerFailure(ctx, localResult, serverResult)

    await ctx.transaction.commit()

    return this.buildSuccessResponse(ctx, PHASE.COMPLETE, '✅ All quality checks passed!', localResult)
  }

  /**
   * Phase 1 verified the edits and SonarQube analysed the files with those edits on disk. What it found, or the
   * server being unreachable, is no reason to undo them: they stay, `fixed` counts them, and `remaining` lines
   * refer to the files as they are.
   */
  private async keepEditsAfterServerFailure(
    ctx: RunContext,
    localResult: PhaseResult,
    serverResult: ServerResult
  ): Promise<QualityFixResponse> {
    await ctx.transaction.commit()

    const kept = keptEditsNotice(countEdits(localResult.fixed))
    const message = this.phase2FailureMessage(serverResult)

    return this.respond(ctx, {
      phase: PHASE.SERVER,
      success: false,
      message: kept === '' ? message : `${kept} ${message}`,
      fixed: localResult.fixed,
      remaining: serverResult.issues,
      checks: localResult.checks,
      error: serverResult.phaseError
    })
  }

  private phase2FailureMessage(serverResult: ServerResult): string {
    if (serverResult.phaseError !== undefined) return 'Phase 2 (SonarQube) failed due to a server or network error.'

    return 'SonarQube found additional issues.'
  }

  /** A failed phase whose edits were rolled back: nothing is a fix, what was tried is `attempted`. */
  private buildFailResponse(
    ctx: RunContext,
    phase: Phase,
    message: string,
    result: PhaseResult,
    options?: { remaining?: Issue[]; qualityError?: QualityError | undefined }
  ): QualityFixResponse {
    return this.respond(ctx, {
      phase,
      success: false,
      message,
      fixed: emptyFixSummary(),
      remaining: options?.remaining ?? result.issues,
      checks: result.checks,
      error: options?.qualityError,
      attempted: result.fixed
    })
  }

  private buildSuccessResponse(
    ctx: RunContext,
    phase: Phase,
    message: string,
    result: PhaseResult
  ): QualityFixResponse {
    return this.respond(ctx, {
      phase,
      success: true,
      message,
      fixed: result.fixed,
      remaining: [],
      checks: result.checks
    })
  }

  /**
   * Roll back file changes after a failed phase so disk matches pre-run state.
   * @returns Error response if rollback failed; otherwise `null` to continue building the failure response.
   */
  private async tryRollback(
    ctx: RunContext,
    failing: { phase: Phase; issues: Issue[] }
  ): Promise<QualityFixResponse | null> {
    try {
      await ctx.transaction.rollback()

      return null
    } catch (rollbackError) {
      console.error('[QualityGate] Rollback failed after phase failure:', rollbackError)

      return this.buildErrorResponse(ctx, ERROR_CODE.ROLLBACK_FAILED, rollbackError, failing)
    }
  }

  private async handleError(error: unknown, ctx: RunContext): Promise<QualityFixResponse> {
    try {
      await ctx.transaction.rollback()
    } catch (rollbackError) {
      console.error('[QualityGate] Rollback failed:', rollbackError)

      return this.buildErrorResponse(ctx, ERROR_CODE.ROLLBACK_FAILED, rollbackError, this.failingPhase(ctx))
    }

    return this.buildErrorResponse(ctx, ERROR_CODE.UNEXPECTED_ERROR, error, this.failingPhase(ctx))
  }

  /**
   * Issues from a failed Phase 1 were found on the auto-fixed output, which a rollback has just discarded.
   * When edits were attempted, re-check the restored files read-only so `remaining` has their line numbers.
   * Issues the restored files do not have keep their text but lose the location.
   */
  private async issuesOnRestoredFiles(ctx: RunContext, localResult: PhaseResult): Promise<Issue[]> {
    if (countEdits(localResult.fixed) === 0) return localResult.issues

    if (localResult.issues.every(issue => issue.line === UNKNOWN_ISSUE_LINE)) return localResult.issues

    try {
      const restored = await this.phase1.run(ctx.absoluteFiles, ctx.transaction, { phase1Mode: 'check' })

      return selectIssuesOnRestoredFiles(localResult.issues, restored.issues)
    } catch (error) {
      console.error('[QualityGate] Could not re-check the restored files:', error)

      return selectIssuesOnRestoredFiles(localResult.issues, [])
    }
  }

  /** Where an error happened, with no findings of its own to report. */
  private failingPhase(ctx: RunContext): { phase: Phase; issues: Issue[] } {
    return { phase: ctx.activePhase, issues: [] }
  }

  private timing(ctx: RunContext): Timing {
    const timing: Timing = {
      phase1: formatDuration(ctx.phase1Time),
      total: formatDuration(Date.now() - ctx.startTime)
    }

    if (ctx.phase2Time > 0) timing.phase2 = formatDuration(ctx.phase2Time)

    return timing
  }

  private respond(ctx: RunContext, input: Omit<ResponseInput, 'timing'>): QualityFixResponse {
    return buildResponse({ ...input, timing: this.timing(ctx) })
  }

  /**
   * @param failing The phase that failed before an error such as a failed rollback. Its issues are kept, without
   * a location, because the files on disk are in an unknown state.
   */
  private buildErrorResponse(
    ctx: RunContext,
    code: ErrorCode,
    error: unknown,
    failing?: { phase: Phase; issues: Issue[] }
  ): QualityFixResponse {
    return failureResponse({
      phase: failing?.phase ?? PHASE.LOCAL,
      message: errorSummary(code),
      remaining: selectIssuesOnRestoredFiles(failing?.issues ?? [], []),
      timing: this.timing(ctx),
      error: qualityErrorFrom(code, error),
      attempted: ctx.lastEdits
    })
  }

  /** Configuration / prerequisite failure (e.g. Phase 2 requested but Sonar not configured) */
  private buildConfigurationFailureResponse(ctx: RunContext, message: string): QualityFixResponse {
    return failureResponse({
      phase: PHASE.LOCAL,
      message,
      remaining: [],
      timing: this.timing(ctx),
      error: { code: ERROR_CODE.CONFIG_INVALID, message }
    })
  }
}
