/**
 * Phase 2: Server Analysis (Optional)
 * Deep SonarQube analysis
 * Only runs if Phase 1 passes AND config exists
 */

import { spawn } from 'node:child_process'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import axios from 'axios'
import type { Config, ServerResult, Issue, SonarQubeIssue, Severity, ErrorCode } from '@/types'
import { isFileRelevantToPaths } from '@/utils/pathMatch'
import { SEVERITY, SONAR_SEVERITY, SONAR_TASK_STATUS } from '@/constants'

/** HTTP 4xx/5xx responses from SonarQube REST API */
const MIN_HTTP_STATUS_CLIENT_ERROR = 400

const tryClassifyAxiosSonarError = (error: unknown): ErrorCode | undefined => {
  const isAxios = typeof axios.isAxiosError === 'function' ? axios.isAxiosError(error) : false

  if (!isAxios) return undefined

  const ax = error as { code?: string; response?: { status?: number } }

  if (ax.code === 'ECONNABORTED') return 'SONAR_TIMEOUT'

  if (ax.code === 'ECONNREFUSED' || ax.code === 'ENOTFOUND' || ax.code === 'ETIMEDOUT') return 'SONAR_CONNECTION_FAILED'

  const status = ax.response?.status

  if (status !== undefined && status >= MIN_HTTP_STATUS_CLIENT_ERROR) return 'SONAR_API_ERROR'

  return undefined
}

const classifySonarFailure = (error: unknown): ErrorCode => {
  const fromAxios = tryClassifyAxiosSonarError(error)

  if (fromAxios !== undefined) return fromAxios

  if (error instanceof Error) {
    const msg = error.message

    if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNABORTED/i.test(msg)) return 'SONAR_CONNECTION_FAILED'

    if (/SonarQube analysis timeout/i.test(msg)) return 'SONAR_TIMEOUT'

    if (/exited with code/i.test(msg)) return 'SONAR_API_ERROR'
  }

  return 'SONAR_API_ERROR'
}

// ═══════════════════════════════════════════════════════════════════════════
// Security: Allowed Scanner Commands
// ═══════════════════════════════════════════════════════════════════════════

const ALLOWED_SCANNERS = new Set(['sonar-scanner', 'npx'])

const validateScannerPath = (scannerPath: string): void => {
  // Extract command name from path (e.g., "/usr/bin/sonar-scanner" -> "sonar-scanner")
  const commandName = scannerPath.split(/[/\\]/).pop() ?? scannerPath

  if (ALLOWED_SCANNERS.has(commandName)) return

  throw new Error(`Security: Scanner '${commandName}' is not in the allowed list`)
}

export class Phase2Server {
  private readonly config: Config

  constructor(config: Config) {
    this.config = config
  }

  /**
   * Run Phase 2 SonarQube analysis
   */
  async run(files: string[]): Promise<ServerResult> {
    console.error('[Phase2] Starting SonarQube analysis')

    if (!this.isConfigured()) {
      console.error('[Phase2] Not configured, skipping')

      return { passed: true, issues: [] }
    }

    try {
      // Step 1: Run sonar-scanner
      console.error('[Phase2] Running sonar-scanner')
      await this.runScanner()

      // Step 2: Wait for analysis to complete
      console.error('[Phase2] Waiting for analysis')
      await this.waitForAnalysis()

      // Step 3: Fetch issues from API
      console.error('[Phase2] Fetching issues')
      const issues = await this.fetchIssues(files)

      console.error(`[Phase2] Found ${issues.length} issues`)

      return {
        passed: issues.length === 0,
        issues
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const code = classifySonarFailure(error)
      console.error('[Phase2] Error:', message)

      return {
        passed: false,
        issues: [
          {
            rule: 'sonarqube',
            file: '',
            line: 0,
            message: `SonarQube analysis failed: ${message}`,
            severity: SEVERITY.ERROR
          }
        ],
        phaseError: { code, message }
      }
    }
  }

  /**
   * Check if Phase 2 is configured
   */
  isConfigured(): boolean {
    return Boolean(this.config.sonarHostUrl && this.config.sonarToken && this.config.sonarProjectKey)
  }

  /**
   * Run sonar-scanner CLI
   */
  private runScanner(): Promise<void> {
    const scannerPath = this.config.sonarScannerPath ?? 'sonar-scanner'

    // Security: Validate scanner command against whitelist
    validateScannerPath(scannerPath)

    const hostUrl = this.config.sonarHostUrl ?? ''
    const token = this.config.sonarToken ?? ''
    const projectKey = this.config.sonarProjectKey ?? ''

    const args = [
      `-Dsonar.host.url=${hostUrl}`,
      `-Dsonar.token=${token}`,
      `-Dsonar.projectKey=${projectKey}`,
      // Skip Quality Gate wait - we handle it ourselves via API
      `-Dsonar.qualitygate.wait=false`,
      // Disable SCM to analyze working directory (not just committed code)
      // This allows catching issues BEFORE commit
      `-Dsonar.scm.disabled=true`
    ]

    return new Promise((resolve, reject) => {
      // Security note: shell: true is required for cross-platform compatibility
      // Scanner path is validated against ALLOWED_SCANNERS whitelist
      // Args are constructed from validated config (not from user input)
      const proc = spawn(scannerPath, args, {
        cwd: this.config.projectRoot,
        shell: true,
        timeout: this.config.phase2Timeout
      })

      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (data: Buffer) => (stdout += data.toString()))

      proc.stderr.on('data', (data: Buffer) => (stderr += data.toString()))

      proc.on('close', code => {
        if (code === 0) resolve()
        else reject(new Error(`sonar-scanner exited with code ${String(code ?? 'unknown')}: ${stderr || stdout}`))
      })

      proc.on('error', error => reject(error))
    })
  }

  /**
   * Wait for SonarQube analysis to complete
   * Uses polling with issues API as CE API may require admin permissions
   */
  private async waitForAnalysis(): Promise<void> {
    const maxWait = 60_000 // 60 seconds should be enough for most analyses
    const fallbackWait = 15_000
    const projectDoesNotExistWaitTime = 10_000
    const pollInterval = 3000
    const startTime = Date.now()

    // First, try CE API (may fail on Community Edition without admin)
    const ceApiWorks = await this.checkCeApiAccess()

    if (ceApiWorks) // Use CE API for accurate status
    {
      while (Date.now() - startTime < maxWait) {
        const status = await this.getTaskStatus()

        if (status === SONAR_TASK_STATUS.SUCCESS) return

        if (status === SONAR_TASK_STATUS.FAILED || status === SONAR_TASK_STATUS.CANCELED) {
          throw new Error(`SonarQube analysis ${status.toLowerCase()}`)
        }

        await this.sleep(pollInterval)
      }
    } else {
      // Fallback: Wait a fixed time and check issues
      // This works when CE API is not accessible (Community Edition)

      // Wait for analysis to complete (typically 5-15 seconds)
      await this.sleep(fallbackWait)

      // Verify analysis completed by checking project exists
      const projectExists = await this.checkProjectAnalyzed()

      if (!projectExists) await this.sleep(projectDoesNotExistWaitTime)

      return
    }

    throw new Error('SonarQube analysis timeout')
  }

  /**
   * Check if status is OK
   */
  private isStatusOk(status: number): boolean {
    const statusOkCode = 200

    return status === statusOkCode
  }

  /**
   * Check if CE API is accessible
   */
  private async checkCeApiAccess(): Promise<boolean> {
    const hostUrl = this.config.sonarHostUrl ?? ''
    const token = this.config.sonarToken ?? ''
    const timeout = 5000

    try {
      const response = await axios.get(`${hostUrl}/api/ce/activity`, {
        params: { ps: 1 },
        headers: { Authorization: `Bearer ${token}` },
        timeout
      })

      return this.isStatusOk(response.status)
    } catch {
      return false
    }
  }

  /**
   * Check if project has been analyzed (has measures)
   */
  private async checkProjectAnalyzed(): Promise<boolean> {
    const hostUrl = this.config.sonarHostUrl ?? ''
    const token = this.config.sonarToken ?? ''
    const component = this.config.sonarProjectKey ?? ''
    const timeout = 5000
    const metricKeys = 'ncloc'

    try {
      const response = await axios.get(`${hostUrl}/api/measures/component`, {
        params: {
          component,
          metricKeys
        },
        headers: { Authorization: `Bearer ${token}` },
        timeout
      })

      return this.isStatusOk(response.status)
    } catch {
      return false
    }
  }

  /**
   * Get latest analysis task status
   */
  private async getTaskStatus(): Promise<string> {
    const hostUrl = this.config.sonarHostUrl ?? ''
    const token = this.config.sonarToken ?? ''
    const projectKey = this.config.sonarProjectKey ?? ''
    const timeout = 10_000

    try {
      const response = await axios.get<{ tasks?: { status?: string }[] }>(`${hostUrl}/api/ce/activity`, {
        params: {
          component: projectKey,
          ps: 1
        },
        headers: {
          Authorization: `Bearer ${token}`
        },
        timeout
      })

      const tasks = response.data.tasks ?? []
      const firstTask = tasks[0]

      if (firstTask) return firstTask.status ?? SONAR_TASK_STATUS.PENDING

      return SONAR_TASK_STATUS.PENDING
    } catch {
      return SONAR_TASK_STATUS.PENDING
    }
  }

  /**
   * Fetch issues from SonarQube API
   */
  private async fetchIssues(files: string[]): Promise<Issue[]> {
    const hostUrl = this.config.sonarHostUrl ?? ''
    const token = this.config.sonarToken ?? ''
    const projectKey = this.config.sonarProjectKey ?? ''
    const timeout = 30_000

    try {
      const response = await axios.get<{ issues?: SonarQubeIssue[] }>(`${hostUrl}/api/issues/search`, {
        params: {
          componentKeys: projectKey,
          resolved: 'false',
          ps: 500
        },
        headers: {
          Authorization: `Bearer ${token}`
        },
        timeout
      })

      const sonarIssues = response.data.issues ?? []

      // Filter to relevant files and convert
      return sonarIssues
        .filter(issue => this.isRelevantFile(issue.component, files))
        .map(issue => this.convertIssue(issue))
    } catch (error) {
      console.error('[Phase2] Failed to fetch issues:', error)

      const message = error instanceof Error ? error.message : String(error)

      throw new Error(`SonarQube issues API failed: ${message}`)
    }
  }

  /**
   * Check if issue's component matches any of the relevant files
   */
  private isRelevantFile(component: string, files: string[]): boolean {
    // SonarQube component format: projectKey:path/to/file.ts
    const colonIndex = component.indexOf(':')
    const rawPath = colonIndex === -1 ? component : component.slice(colonIndex + 1)
    const sonarPath = path.normalize(rawPath)

    return isFileRelevantToPaths(sonarPath, files)
  }

  /**
   * Convert SonarQube issue to our Issue type
   */
  private convertIssue(sonarIssue: SonarQubeIssue): Issue {
    const colonIndex = sonarIssue.component.indexOf(':')
    const file = colonIndex === -1 ? sonarIssue.component : sonarIssue.component.slice(colonIndex + 1)

    return {
      rule: sonarIssue.rule,
      file,
      line: sonarIssue.line ?? 0,
      message: sonarIssue.message,
      severity: this.mapSeverity(sonarIssue.severity)
    }
  }

  /**
   * Map SonarQube severity to our severity
   */
  private mapSeverity(sonarSeverity: string): Severity {
    const upperSeverity = sonarSeverity.toUpperCase()

    if (upperSeverity === SONAR_SEVERITY.BLOCKER || upperSeverity === SONAR_SEVERITY.CRITICAL) return SEVERITY.ERROR

    if (upperSeverity === SONAR_SEVERITY.MAJOR) return SEVERITY.WARNING

    return SEVERITY.INFO
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return delay(ms)
  }
}
