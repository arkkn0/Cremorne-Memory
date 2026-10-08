import { describe, expect, it } from 'vitest'
import { CREMORNE_OPERATING_POLICY } from '../server/operating-policy'

describe('Cremorne operating policy', () => {
  it('keeps personal learning immediate and precinct promotion reviewed', () => {
    expect(CREMORNE_OPERATING_POLICY.promotion.personalOutcomeWritesImmediately).toBe(true)
    expect(CREMORNE_OPERATING_POLICY.promotion.precinctRuleRequiresCdhReview).toBe(true)
    expect(CREMORNE_OPERATING_POLICY.promotion.validatedRulesRemainRequirementScoped).toBe(true)
  })

  it('requires independent evidence before a route or room issue enters review', () => {
    expect(CREMORNE_OPERATING_POLICY.evidence.independentReportersForRouteBoundary).toBeGreaterThanOrEqual(2)
    expect(CREMORNE_OPERATING_POLICY.evidence.independentReportersForRoomIssue).toBeGreaterThanOrEqual(2)
    expect(CREMORNE_OPERATING_POLICY.evidence.minimumCandidateTracePoints).toBe(3)
  })

  it('preserves owner control over shared workspace', () => {
    expect(CREMORNE_OPERATING_POLICY.access.sharedWorkspaceRequiresOwnerWindow).toBe(true)
    expect(CREMORNE_OPERATING_POLICY.access.workerRetainsFinalChoice).toBe(true)
  })
})
