import type { WorkspaceIssueInput } from '../src/api-contracts.js'

const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/ /g, '-')

export function routeExceptionId(capacityUnitId: string, requirement: string) {
  return `route-exception-${key(capacityUnitId)}-${key(requirement)}`
}

export function workspaceIssueRequirement(issue: WorkspaceIssueInput) {
  if (issue.issue === 'temperature') return 'thermal-comfort'
  if (issue.issue === 'blinds') return 'adjustable-blinds'
  if (issue.issue === 'acoustics') return 'hybrid'
  if (issue.issue === 'accessibility') return 'mobility'
  if (issue.issue === 'equipment') return issue.facility ? `equipment:${key(issue.facility)}` : 'equipment'
  return 'standard'
}

export function workspaceIssueSummary(issue: WorkspaceIssueInput) {
  const subject = issue.issue === 'temperature' ? 'temperature or air-conditioning'
    : issue.issue === 'equipment' ? `${issue.facility || 'room equipment'}`
      : issue.issue === 'blinds' ? 'sun-control blinds'
        : issue.issue === 'acoustics' ? 'room acoustics'
          : issue.issue === 'accessibility' ? 'accessibility'
            : 'room experience'
  return `A previous visit reported an issue with ${subject}${issue.detail ? `: ${issue.detail}` : '.'}`
}

export function workspaceIssueId(capacityUnitId: string, issue: WorkspaceIssueInput) {
  const discriminator = issue.facility ? `-${key(issue.facility)}` : ''
  return `workspace-issue-${key(capacityUnitId)}-${issue.issue}${discriminator}`
}
