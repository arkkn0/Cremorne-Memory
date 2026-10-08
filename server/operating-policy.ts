/**
 * CDH's bounded operating policy for the Cremorne pilot.
 *
 * Product code answers “what can serve this request now?”. This policy defines
 * when local observations are strong enough to affect later decisions. Keeping
 * it in one module makes the thresholds visible, testable and replaceable by a
 * future CDH configuration service.
 */
export const CREMORNE_OPERATING_POLICY = Object.freeze({
  id: 'cdh-cremorne-pilot-v1',
  precinct: 'Cremorne',
  evidence: Object.freeze({
    independentReportersForRouteBoundary: Math.max(2, Number(process.env.CREMORNE_ROUTE_EXCEPTION_THRESHOLD || 3)),
    independentReportersForRoomIssue: Math.max(2, Number(process.env.CREMORNE_ROOM_ISSUE_THRESHOLD || 3)),
    minimumUvForLowUvBoundary: Math.max(0, Number(process.env.CREMORNE_LOW_UV_BOUNDARY_MINIMUM || 3)),
    minimumCandidateTracePoints: 3,
    maximumCandidateTracePoints: 500,
  }),
  access: Object.freeze({
    sharedWorkspaceRequiresOwnerWindow: true,
    internalWorkspaceRequiresOrganisationMatch: true,
    workerRetainsFinalChoice: true,
  }),
  promotion: Object.freeze({
    personalOutcomeWritesImmediately: true,
    precinctRuleRequiresCdhReview: true,
    validatedRulesRemainRequirementScoped: true,
  }),
})

export type CremorneOperatingPolicy = typeof CREMORNE_OPERATING_POLICY
