import { z } from 'zod'
import type { DecisionRequest } from '../src/api-contracts.js'
import { CREMORNE_OPERATING_POLICY } from './operating-policy.js'

const boundedText = (max: number) => z.string().trim().min(1).max(max)
const id = z.string().trim().min(1).max(180).regex(/^[a-zA-Z0-9._:-]+$/)
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

const requirementsSchema = z.object({
  lowUv: z.boolean(),
  stepFree: z.boolean(),
  accessible: z.boolean(),
  hybridEquipment: z.boolean(),
  equipment: z.array(boundedText(80)).max(20),
}).strict()

const preferencesSchema = z.object({
  crowding: z.enum(['lower', 'standard']),
  uv: z.enum(['lower', 'standard']),
}).strict()

const structuredDemandSchema = z.object({
  intent: z.enum(['movement', 'workspace']),
  originalText: z.string().max(2_000),
  destinationText: z.string().max(200).nullable(),
  destinationId: z.string().max(120).nullable(),
  arrivalDeadline: clock.nullable(),
  departureFlexibilityMinutes: z.number().int().min(0).max(24 * 60),
  startTime: clock.nullable(),
  durationMinutes: z.number().int().min(0).max(24 * 60),
  capacityRequired: z.number().int().min(1).max(10_000),
  requirements: requirementsSchema,
  preferences: preferencesSchema,
  requirementStrength: z.enum(['required', 'preferred']),
  requesterOrganisation: z.string().max(160).nullable(),
  confidence: z.number().finite().min(0).max(1),
  unresolvedFields: z.array(z.string().max(120)).max(20),
}).strict()

const contextSchema = z.object({
  uvIndex: z.number().finite().min(0).max(20),
  temperature: z.number().finite().min(-100).max(100),
  crowding: z.number().finite().min(0).max(100),
  workers: z.number().int().min(0).max(10_000),
  requestedAt: z.string().trim().min(1).max(80),
  acceptedRecommendations: z.record(z.string().max(180), z.number().int().min(0).max(1_000_000)).optional(),
  profileId: z.string().trim().min(1).max(180).optional(),
}).strict()

const memoryRuleSchema = z.object({
  id,
  createdAt: z.string().trim().min(1).max(80),
  context: z.object({
    uvMin: z.number().finite().min(0).max(20),
    crowdingMin: z.number().finite().min(0).max(100),
    place: boundedText(180),
  }).strict(),
  routeId: z.enum(['A', 'B', 'C']),
  outcome: z.object({
    crowdingDelta: z.number().finite().min(-100).max(100),
    walkingDelta: z.number().finite().min(-100).max(100),
  }).strict(),
  exception: z.object({
    functionalNeed: z.enum(['low-uv', 'step-free']),
    metric: boundedText(180),
    delta: z.number().finite().min(-1_000).max(1_000),
  }).strict(),
  confidence: z.number().finite().min(0).max(1),
  deploymentBoundary: boundedText(500),
}).strict()

const metricsSchema = z.record(
  z.string().trim().min(1).max(80),
  z.number().finite().min(-1_000_000).max(1_000_000),
).refine((value) => Object.keys(value).length <= 32, 'At most 32 metrics may be submitted.')

const workspaceIssueSchema = z.object({
  issue: z.enum(['temperature', 'equipment', 'blinds', 'acoustics', 'accessibility', 'other']),
  detail: z.string().trim().min(1).max(500).optional(),
  facility: z.string().trim().min(1).max(120).optional(),
  severity: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
}).strict()

const recommendationSchema = z.object({
  action: z.literal('recommend'),
  brief: boundedText(2_000).optional(),
  demand: structuredDemandSchema.partial().optional(),
  context: contextSchema,
  useMemory: z.boolean().optional(),
}).strict().refine(
  (value) => Boolean(value.brief || (value.demand && Object.keys(value.demand).length)),
  'A brief or structured demand is required.',
)

const outcomeSchema = z.object({
  action: z.literal('outcome'),
  decisionId: z.string().uuid(),
  capacityUnitId: id,
  demand: structuredDemandSchema,
  context: contextSchema,
  feedback: z.enum(['better', 'same', 'worse']).optional(),
  metrics: metricsSchema,
  candidateRule: memoryRuleSchema.optional(),
  journeyTrace: z.array(z.tuple([
    z.number().finite().min(-90).max(90),
    z.number().finite().min(-180).max(180),
  ])).min(CREMORNE_OPERATING_POLICY.evidence.minimumCandidateTracePoints).max(CREMORNE_OPERATING_POLICY.evidence.maximumCandidateTracePoints).optional(),
  shareTrace: z.boolean().optional(),
  candidateRouteName: boundedText(120).optional(),
  workspaceIssues: z.array(workspaceIssueSchema).max(10).optional(),
}).strict().superRefine((value, context) => {
  if (value.shareTrace && !value.journeyTrace) {
    context.addIssue({ code: 'custom', message: 'A shared trace requires at least three coordinates.' })
  }
  if (value.shareTrace && value.feedback && value.feedback !== 'better') {
    context.addIssue({ code: 'custom', message: 'A walked trace can be shared as a candidate only when it felt better.' })
  }
  if (value.workspaceIssues?.length && value.demand.intent !== 'workspace') {
    context.addIssue({ code: 'custom', message: 'Workspace issues require a workspace demand.' })
  }
})

const candidateRoutesSchema = z.object({
  action: z.literal('candidate-routes'),
  status: z.enum(['candidate', 'under-validation', 'validated', 'rejected']).optional(),
}).strict()

const routeEvidenceSchema = z.object({
  durationMinutes: z.number().finite().min(0).max(24 * 60).optional(),
  distanceMetres: z.number().finite().min(0).max(1_000_000).optional(),
  shadePercent: z.number().finite().min(0).max(100).optional(),
  directUvFactor: z.number().finite().min(0).max(10).optional(),
  safeCapacity: z.number().int().min(0).max(100_000).optional(),
  stepFree: z.boolean().optional(),
  baselineDemandShare: z.number().finite().min(0).max(1).optional(),
  confidence: z.number().finite().min(0).max(1).optional(),
}).strict()

const candidateRouteReviewSchema = z.object({
  action: z.literal('candidate-route-review'),
  candidateCapacityId: id,
  decision: z.enum(['validate', 'reject']),
  reason: boundedText(1_000),
  evidence: routeEvidenceSchema.optional(),
}).strict()

const workspaceIssuesSchema = z.object({
  action: z.literal('workspace-issues'),
  status: z.enum(['collecting', 'candidate', 'validated', 'rejected']).optional(),
}).strict()

const workspaceIssueReviewSchema = z.object({
  action: z.literal('workspace-issue-review'),
  issueId: id,
  decision: z.enum(['validate', 'reject']),
  reason: boundedText(1_000),
}).strict()

const routeExceptionsSchema = z.object({
  action: z.literal('route-exceptions'),
  status: z.enum(['collecting', 'candidate', 'validated', 'rejected']).optional(),
}).strict()

const routeExceptionReviewSchema = z.object({
  action: z.literal('route-exception-review'),
  exceptionId: id,
  decision: z.enum(['validate', 'reject']),
  reason: boundedText(1_000),
}).strict()

const decisionRequestSchema = z.discriminatedUnion('action', [
  recommendationSchema,
  outcomeSchema,
  candidateRoutesSchema,
  candidateRouteReviewSchema,
  workspaceIssuesSchema,
  workspaceIssueReviewSchema,
  routeExceptionsSchema,
  routeExceptionReviewSchema,
])

export function validateDecisionRequest(value: unknown):
  | { success: true; data: DecisionRequest }
  | { success: false; issues: string[] } {
  const parsed = decisionRequestSchema.safeParse(value)
  if (parsed.success) return { success: true, data: parsed.data as DecisionRequest }
  return {
    success: false,
    issues: parsed.error.issues.slice(0, 8).map((issue) => `${issue.path.join('.') || 'request'}: ${issue.message}`),
  }
}
