/**
 * Options for {@link QualityGate.run} (CLI and programmatic use)
 */

import type { FixSummary } from './mcp'

export type Phase1Mode = 'check' | 'fix'

export type QualityGatePhases = 'all' | 'phase1' | 'phase2'

export interface Phase1RunOptions {
  phase1Mode?: Phase1Mode
  /**
   * Called once, before the first edit, with the summary Phase 1 keeps filling in as it edits files.
   * The object stays live, so a caller still sees the edits made before Phase 1 throws.
   */
  onFixSummary?: (summary: FixSummary) => void
}

export interface QualityGateRunOptions {
  phase1Mode?: Phase1Mode
  phases?: QualityGatePhases
}
