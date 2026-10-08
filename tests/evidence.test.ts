import { describe, expect, it } from 'vitest'
import { routeExceptionId, workspaceIssueId, workspaceIssueRequirement } from '../server/evidence'

describe('Cremorne evidence vocabulary', () => {
  it('keeps a route boundary scoped to capacity and functional requirement', () => {
    expect(routeExceptionId('movement-route-b', 'low-uv')).toBe('route-exception-movement-route-b-low-uv')
  })

  it('maps room experience to the requirement it can affect', () => {
    expect(workspaceIssueRequirement({ issue: 'blinds' })).toBe('adjustable-blinds')
    expect(workspaceIssueRequirement({ issue: 'equipment', facility: 'Hybrid Display' })).toBe('equipment:hybrid-display')
  })

  it('creates a stable issue key for repeated independent reports', () => {
    expect(workspaceIssueId('workspace-boardroom', { issue: 'equipment', facility: 'Hybrid Display' }))
      .toBe('workspace-issue-workspace-boardroom-equipment-hybrid-display')
  })
})
