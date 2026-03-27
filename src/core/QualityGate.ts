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
  QualityError
} from '@/types'
import { CUSTOM_RULE_PREFIX, PHASE, RULE_NAMES } from '@/constants'
import { TransactionManager } from '@/core/TransactionManager'
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
}

interface PhaseResult {
  passed: boolean
  fixed: FixSummary
  issues: Issue[]
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

    try {
      return await this.executePhases(ctx, options)
    } catch (error) {
      return this.handleError(error, ctx)
    }
  }

  private createContext(files: string[]): RunContext {
    return {
      startTime: Date.now(),
      phase1Time: 0,
      phase2Time: 0,
      transaction: this.transactionManager.begin(),
      absoluteFiles: files.map(file => (path.isAbsolute(file) ? file : path.resolve(this.config.projectRoot, file)))
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
    return {
      passed,
      fixed: this.createEmptyFixSummary(),
      issues: []
    }
  }

  /**
   * Human-readable summary for MCP/CLI when Phase 1 fails (e.g. "TypeScript: 2 issues in src/index.ts").
   */
  private summarizePhase1Failure(issues: Issue[]): string {
    if (issues.length === 0) return 'Local analysis found issues. Fix these first.'

    const root = this.config.projectRoot
    const segments: string[] = []
    const tsIssues = issues.filter(i => this.isPhase1TypeScriptIssue(i))
    const customIssues = issues.filter(i => i.rule.startsWith(CUSTOM_RULE_PREFIX))
    const jsonIssues = issues.filter(i => i.rule.startsWith('json/'))
    const eslintIssues = issues.filter(
      i => !this.isPhase1TypeScriptIssue(i) && !i.rule.startsWith(CUSTOM_RULE_PREFIX) && !i.rule.startsWith('json/')
    )

    if (tsIssues.length > 0) segments.push(this.formatPhase1IssueGroup('TypeScript', tsIssues, root))

    if (eslintIssues.length > 0) segments.push(this.formatPhase1IssueGroup('ESLint', eslintIssues, root))

    if (customIssues.length > 0) segments.push(this.formatPhase1IssueGroup('Custom rules', customIssues, root))

    if (jsonIssues.length > 0) segments.push(this.formatPhase1IssueGroup('JSON', jsonIssues, root))

    return segments.length > 0 ? segments.join('; ') : 'Local analysis found issues. Fix these first.'
  }

  private isPhase1TypeScriptIssue(issue: Issue): boolean {
    return issue.rule === RULE_NAMES.TYPESCRIPT || issue.rule === RULE_NAMES.TYPESCRIPT_DEPRECATED
  }

  private formatPhase1IssueGroup(label: string, issues: Issue[], projectRoot: string): string {
    const n = issues.length
    const issueWord = n === 1 ? 'issue' : 'issues'
    const first = issues[0]
    const file = first?.file
    let where: string

    if (file === undefined || file === 'unknown' || file.length === 0) {
      where = 'multiple files'
    } else {
      const resolved = path.isAbsolute(file) ? file : path.resolve(projectRoot, file)
      const rel = path.relative(projectRoot, resolved)

      where = rel.length > 0 && !rel.startsWith('..') ? rel : file
    }

    return `${label}: ${n} ${issueWord} in ${where}`
  }

  private async runPhase2OnlyPipeline(ctx: RunContext): Promise<QualityFixResponse> {
    if (!this.phase2.isConfigured()) {
      return this.buildConfigurationFailureResponse(ctx, 'Phase 2 is not configured (SonarQube env or config missing).')
    }

    const phase2Start = Date.now()
    const serverResult = await this.phase2.run(ctx.absoluteFiles)
    ctx.phase2Time = Date.now() - phase2Start

    if (!serverResult.passed) {
      const rollbackResponse = await this.tryRollback(ctx)

      if (rollbackResponse) return rollbackResponse

      return this.buildFailResponse(
        ctx,
        PHASE.SERVER,
        this.phase2FailureMessage(serverResult),
        this.emptyPhaseResult(false),
        this.phase2FailResponseOptions(serverResult)
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
    const phase1Start = Date.now()
    const localResult = await this.phase1.run(ctx.absoluteFiles, ctx.transaction, phase1Opts)
    ctx.phase1Time = Date.now() - phase1Start

    if (!localResult.passed) {
      const rollbackResponse = await this.tryRollback(ctx)

      if (rollbackResponse) return rollbackResponse

      return this.buildFailResponse(ctx, PHASE.LOCAL, this.summarizePhase1Failure(localResult.issues), localResult)
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

  private async runPhase2WithLocal(ctx: RunContext, localResult: PhaseResult): Promise<QualityFixResponse> {
    const phase2Start = Date.now()
    const serverResult = await this.phase2.run(ctx.absoluteFiles)
    ctx.phase2Time = Date.now() - phase2Start

    if (!serverResult.passed) {
      const rollbackResponse = await this.tryRollback(ctx)

      if (rollbackResponse) return rollbackResponse

      return this.buildFailResponse(
        ctx,
        PHASE.SERVER,
        this.phase2FailureMessage(serverResult),
        localResult,
        this.phase2FailResponseOptions(serverResult)
      )
    }

    await ctx.transaction.commit()

    return this.buildSuccessResponse(ctx, PHASE.COMPLETE, '✅ All quality checks passed!', localResult)
  }

  private phase2FailureMessage(serverResult: ServerResult): string {
    if (serverResult.phaseError !== undefined) return 'Phase 2 (SonarQube) failed due to a server or network error.'

    return 'SonarQube found additional issues.'
  }

  private phase2FailResponseOptions(serverResult: ServerResult): {
    remaining: Issue[]
    qualityError?: QualityError
  } {
    const qe = serverResult.phaseError

    if (qe === undefined) return { remaining: serverResult.issues }

    return { remaining: serverResult.issues, qualityError: qe }
  }

  private buildFailResponse(
    ctx: RunContext,
    phase: Phase,
    message: string,
    result: PhaseResult,
    options?: { remaining?: Issue[]; qualityError?: QualityError }
  ): QualityFixResponse {
    const remaining = options?.remaining ?? result.issues

    const params: Parameters<typeof this.buildResponse>[0] = {
      phase,
      success: false,
      message,
      fixed: result.fixed,
      remaining,
      phase1Time: ctx.phase1Time,
      totalTime: Date.now() - ctx.startTime
    }

    if (ctx.phase2Time > 0) params.phase2Time = ctx.phase2Time

    const response = this.buildResponse(params)

    if (options?.qualityError !== undefined) return { ...response, error: options.qualityError }

    return response
  }

  private buildSuccessResponse(
    ctx: RunContext,
    phase: Phase,
    message: string,
    result: PhaseResult
  ): QualityFixResponse {
    const params: Parameters<typeof this.buildResponse>[0] = {
      phase,
      success: true,
      message,
      fixed: result.fixed,
      remaining: [],
      phase1Time: ctx.phase1Time,
      totalTime: Date.now() - ctx.startTime
    }

    if (ctx.phase2Time > 0) params.phase2Time = ctx.phase2Time

    return this.buildResponse(params)
  }

  /**
   * Roll back file changes after a failed phase so disk matches pre-run state.
   * @returns Error response if rollback failed; otherwise `null` to continue building the failure response.
   */
  private async tryRollback(ctx: RunContext): Promise<QualityFixResponse | null> {
    try {
      await ctx.transaction.rollback()

      return null
    } catch (rollbackError) {
      console.error('[QualityGate] Rollback failed after phase failure:', rollbackError)

      return this.buildErrorResponse(ctx, 'ROLLBACK_FAILED', rollbackError)
    }
  }

  private async handleError(error: unknown, ctx: RunContext): Promise<QualityFixResponse> {
    try {
      await ctx.transaction.rollback()
    } catch (rollbackError) {
      console.error('[QualityGate] Rollback failed:', rollbackError)

      return this.buildErrorResponse(ctx, 'ROLLBACK_FAILED', rollbackError)
    }

    return this.buildErrorResponse(ctx, 'UNEXPECTED_ERROR', error)
  }

  /**
   * Create empty FixSummary with all properties set to 0
   * Used for error responses when no fixes were applied
   */
  private createEmptyFixSummary(): FixSummary {
    return {
      eslint: 0,
      curlyBraces: 0,
      singleLineArrow: 0,
      prettier: 0,
      json: 0
    }
  }

  private buildErrorResponse(ctx: RunContext, code: ErrorCode, error: unknown): QualityFixResponse {
    const emptyFixed = this.createEmptyFixSummary()

    return {
      phase: PHASE.LOCAL,
      success: false,
      message:
        code === 'ROLLBACK_FAILED' ? 'Critical error: rollback failed' : 'An error occurred during quality checks',
      fixed: emptyFixed,
      remaining: [],
      timing: {
        phase1: this.formatTime(ctx.phase1Time),
        total: this.formatTime(Date.now() - ctx.startTime)
      },
      totalIssues: 0,
      remainingCount: 0,
      fixedCount: 0,
      error: {
        code,
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /** Configuration / prerequisite failure (e.g. Phase 2 requested but Sonar not configured) */
  private buildConfigurationFailureResponse(ctx: RunContext, message: string): QualityFixResponse {
    const emptyFixed = this.createEmptyFixSummary()

    return {
      phase: PHASE.LOCAL,
      success: false,
      message,
      fixed: emptyFixed,
      remaining: [],
      timing: {
        phase1: this.formatTime(ctx.phase1Time),
        total: this.formatTime(Date.now() - ctx.startTime)
      },
      totalIssues: 0,
      remainingCount: 0,
      fixedCount: 0,
      error: {
        code: 'CONFIG_INVALID',
        message
      }
    }
  }

  /**
   * Calculate total fixed count by summing all numeric values in FixSummary
   * Dynamic approach - automatically includes new fix types without code changes
   */
  private calculateFixedCount(fixed: FixSummary): number {
    const values = Object.values(fixed) as number[]

    return values.reduce((sum, count) => sum + count, 0)
  }

  private buildResponse(params: {
    phase: Phase
    success: boolean
    message: string
    fixed: FixSummary
    remaining: Issue[]
    phase1Time: number
    phase2Time?: number
    totalTime: number
  }): QualityFixResponse {
    // Calculate total fixed count (sum of all fix types) - dynamic approach
    const fixedCount = this.calculateFixedCount(params.fixed)

    // Calculate remaining issues count
    const remainingCount = params.remaining.length

    // Total issues = fixed + remaining
    const totalIssues = fixedCount + remainingCount

    const response: QualityFixResponse = {
      phase: params.phase,
      success: params.success,
      message: params.message,
      totalIssues,
      remainingCount,
      fixedCount,
      fixed: params.fixed,
      remaining: params.remaining,
      timing: {
        phase1: this.formatTime(params.phase1Time),
        total: this.formatTime(params.totalTime)
      }
    }

    if (params.phase2Time) response.timing.phase2 = this.formatTime(params.phase2Time)

    return response
  }

  private formatTime(ms: number): string {
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
  }
}
