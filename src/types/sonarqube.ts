/**
 * SonarQube Types - Phase 2 server analysis
 */

export interface SonarQubeIssue {
  key: string
  rule: string
  severity: string
  component: string
  line?: number
  message: string
  type: string
}

export interface SonarQubeTaskStatus {
  id: string
  status: 'CANCELED' | 'FAILED' | 'IN_PROGRESS' | 'PENDING' | 'SUCCESS'
}
