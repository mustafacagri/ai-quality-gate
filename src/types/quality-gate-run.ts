/**
 * Options for {@link QualityGate.run} (CLI and programmatic use)
 */

export type Phase1Mode = 'check' | 'fix'

export type QualityGatePhases = 'all' | 'phase1' | 'phase2'

export interface Phase1RunOptions {
  phase1Mode?: Phase1Mode
}

export interface QualityGateRunOptions {
  phase1Mode?: Phase1Mode
  phases?: QualityGatePhases
}
