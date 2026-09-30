import { describe, expect, it } from 'vitest'
import { listCandidateRoutes, listWorkspaceIssues, recommend, recordOutcome, reviewCandidateRoute, reviewWorkspaceIssue } from '../server/decision-service'
import { InMemoryCapacityGraph } from '../server/graph'
import type { DecisionContext } from '../src/api-contracts'

const context: DecisionContext = {
  uvIndex: 8.2,
  temperature: 31,
  crowding: 82,
  workers: 65,
  requestedAt: '2026-09-30T16:00:00.000+10:00',
  profileId: 'mia-demo',
}

describe('graph-grounded decision loop', () => {
  it('starts without invented Memory and retrieves a real recorded personal outcome', async () => {
    const graph = new InMemoryCapacityGraph()
    const withoutMemory = await recommend({ action: 'recommend', brief: 'Get me to East Richmond by 4:20pm and avoid direct sun.', context, useMemory: false }, graph)
    await recordOutcome({
      action: 'outcome', decisionId: withoutMemory.decisionId, capacityUnitId: 'route-east-richmond-b',
      demand: withoutMemory.demand, context, feedback: 'worse', metrics: { elapsedSeconds: 620 },
    }, graph)
    const withMemory = await recommend({ action: 'recommend', brief: 'Get me to East Richmond by 4:20pm and avoid direct sun.', context, useMemory: true }, graph)

    expect(withoutMemory.options.find((option) => option.name.includes('Route B'))?.eligible).toBe(true)
    expect(withMemory.options.find((option) => option.name.includes('Route B'))?.memory).toEqual(
      expect.arrayContaining([expect.objectContaining({ scope: 'personal', summary: expect.stringContaining('worse') })]),
    )
    expect(withMemory.recommendation?.name).toContain('Shadow Route C')
  })

  it('keeps Route B available for an ordinary request', async () => {
    const response = await recommend({ action: 'recommend', brief: 'Get me to East Richmond by 4:20pm.', context, useMemory: true }, new InMemoryCapacityGraph())
    expect(response.recommendation?.name).toContain('Route B')
  })

  it('writes an outcome and retrieves it on a comparable second request', async () => {
    const graph = new InMemoryCapacityGraph()
    const first = await recommend({ action: 'recommend', brief: 'Get me to East Richmond by 4:20pm.', context, useMemory: true }, graph)
    const selected = first.recommendation!
    const outcome = await recordOutcome({
      action: 'outcome', decisionId: first.decisionId, capacityUnitId: selected.id,
      demand: first.demand, context, feedback: 'worse', metrics: { elapsedSeconds: 720 },
    }, graph)
    const second = await recommend({ action: 'recommend', brief: 'Get me to East Richmond by 4:20pm.', context, useMemory: true }, graph)

    expect(outcome.memoryIds).toContain(outcome.outcomeId)
    expect(second.retrievedMemory.some((memory) => memory.id === outcome.outcomeId)).toBe(true)
  })

  it('stores a retried outcome and its candidate route only once', async () => {
    const graph = new InMemoryCapacityGraph()
    const first = await recommend({ action: 'recommend', brief: 'Get me to East Richmond by 4:20pm.', context, useMemory: true }, graph)
    const request = {
      action: 'outcome' as const,
      decisionId: first.decisionId,
      capacityUnitId: first.recommendation!.id,
      demand: first.demand,
      context,
      feedback: 'better' as const,
      metrics: { elapsedSeconds: 510 },
      shareTrace: true,
      journeyTrace: [[-37.83036, 144.99455], [-37.8298, 144.9954], [-37.8289, 144.9964]] as [number, number][],
      candidateRouteName: 'Worker-discovered shaded lane',
    }

    const stored = await recordOutcome(request, graph)
    const retried = await recordOutcome(request, graph)
    const candidates = await listCandidateRoutes({ action: 'candidate-routes', status: 'candidate' }, graph)
    const next = await recommend({ action: 'recommend', brief: 'Get me to East Richmond by 4:20pm.', context, useMemory: true }, graph)

    expect(retried.outcomeId).toBe(stored.outcomeId)
    expect(retried.candidateCapacityId).toBe(stored.candidateCapacityId)
    expect(candidates.candidates).toHaveLength(1)
    expect(next.retrievedMemory.filter((memory) => memory.id === stored.outcomeId)).toHaveLength(1)

    await reviewCandidateRoute({
      action: 'candidate-route-review', candidateCapacityId: stored.candidateCapacityId!, decision: 'validate',
      reason: 'The repeated trace was independently verified.', evidence: { confidence: 0.8 },
    }, graph)
    await recordOutcome(request, graph)
    const afterReviewedRetry = await listCandidateRoutes({ action: 'candidate-routes', status: 'validated' }, graph)
    expect(afterReviewedRetry.candidates).toHaveLength(1)
  })

  it('does not inflate workspace issue evidence when an outcome is retried', async () => {
    const graph = new InMemoryCapacityGraph()
    const decision = await recommend({
      action: 'recommend', brief: 'I need a room for six people at 2pm for 45 minutes with hybrid equipment.',
      context, useMemory: true,
    }, graph)
    const request = {
      action: 'outcome' as const,
      decisionId: decision.decisionId,
      capacityUnitId: 'workspace-boardroom',
      demand: decision.demand,
      context,
      feedback: 'worse' as const,
      metrics: {},
      workspaceIssues: [{ issue: 'acoustics' as const, detail: 'Remote participants could not hear clearly.', severity: 2 as const }],
    }

    await recordOutcome(request, graph)
    await recordOutcome(request, graph)
    const issues = await listWorkspaceIssues({ action: 'workspace-issues', status: 'collecting' }, graph)

    expect(issues.issues).toHaveLength(1)
    expect(issues.issues[0]).toMatchObject({ reportCount: 1, independentReporterCount: 1 })
  })

  it('uses the same graph for a room × time request', async () => {
    const response = await recommend({ action: 'recommend', brief: 'I need a room for six people at 2pm for 45 minutes with hybrid equipment and a display.', context, useMemory: true }, new InMemoryCapacityGraph())
    expect(response.demand.intent).toBe('workspace')
    expect(response.recommendation).toBeNull()
    expect(response.options.find((option) => option.productId === 'boardroom')).toMatchObject({
      safeCapacity: 12,
      eligible: false,
      facilities: expect.arrayContaining(['Video conference']),
    })
  })

  it('adds a better, distinct walked trace as candidate capacity', async () => {
    const graph = new InMemoryCapacityGraph()
    const first = await recommend({ action: 'recommend', brief: 'Get me to East Richmond by 4:20pm.', context, useMemory: true }, graph)
    const stored = await recordOutcome({
      action: 'outcome', decisionId: first.decisionId, capacityUnitId: first.recommendation!.id,
      demand: first.demand, context, feedback: 'better', metrics: { elapsedSeconds: 510 },
      shareTrace: true,
      journeyTrace: [[-37.83036, 144.99455], [-37.8298, 144.9954], [-37.8289, 144.9964]],
      candidateRouteName: 'Worker-discovered shaded lane',
    }, graph)
    expect(stored.candidateCapacityId).toMatch(/^candidate-route-/)

    const pending = await listCandidateRoutes({ action: 'candidate-routes', status: 'candidate' }, graph)
    expect(pending.candidates).toHaveLength(1)
    expect(pending.candidates[0]).toMatchObject({
      id: stored.candidateCapacityId,
      status: 'candidate',
      requirement: 'standard',
      evidenceCount: 1,
    })

    const beforeValidation = await recommend({
      action: 'recommend', brief: 'Get me to East Richmond by 4:20pm.', context, useMemory: true,
    }, graph)
    expect(beforeValidation.options.some((option) => option.id === stored.candidateCapacityId)).toBe(false)

    const reviewed = await reviewCandidateRoute({
      action: 'candidate-route-review',
      candidateCapacityId: stored.candidateCapacityId!,
      decision: 'validate',
      reason: 'Controlled comparison confirmed lower exposure within the same arrival window.',
      evidence: { durationMinutes: 9, shadePercent: 46, directUvFactor: 0.58, safeCapacity: 34, confidence: 0.78 },
    }, graph)
    expect(reviewed.candidate).toMatchObject({ status: 'validated', evidenceCount: 2, validationConfidence: 0.78 })

    const afterValidation = await recommend({
      action: 'recommend', brief: 'Get me to East Richmond by 4:20pm and avoid direct sun.', context, useMemory: true,
    }, graph)
    expect(afterValidation.options.some((option) => option.id === stored.candidateCapacityId && option.eligible)).toBe(true)
  })

  it('stores a map-drawn route as a proposal rather than a measured outcome', async () => {
    const graph = new InMemoryCapacityGraph()
    const first = await recommend({ action: 'recommend', brief: 'Get me to East Richmond by 4:20pm.', context, useMemory: true }, graph)
    const stored = await recordOutcome({
      action: 'outcome', decisionId: first.decisionId, capacityUnitId: first.recommendation!.id,
      demand: first.demand, context, metrics: { drawnPointCount: 3 }, shareTrace: true,
      journeyTrace: [[-37.83036, 144.99455], [-37.8297, 144.9958], [-37.8288, 144.9968]],
      candidateRouteName: 'Worker-proposed passage',
    }, graph)
    const pending = await listCandidateRoutes({ action: 'candidate-routes', status: 'candidate' }, graph)
    expect(stored.memoryIds).toHaveLength(0)
    expect(pending.candidates[0]).toMatchObject({ name: 'Worker-proposed passage', feedback: 'proposed', status: 'candidate' })
  })

  it('keeps personal feedback isolated from other profiles', async () => {
    const graph = new InMemoryCapacityGraph()
    const first = await recommend({ action: 'recommend', brief: 'Get me to East Richmond by 4:20pm.', context, useMemory: true }, graph)
    await recordOutcome({
      action: 'outcome', decisionId: first.decisionId, capacityUnitId: first.recommendation!.id,
      demand: first.demand, context, feedback: 'worse', metrics: { elapsedSeconds: 720 },
    }, graph)
    const mia = await recommend({ action: 'recommend', brief: 'Get me to East Richmond by 4:20pm.', context, useMemory: true }, graph)
    const anotherWorker = await recommend({
      action: 'recommend', brief: 'Get me to East Richmond by 4:20pm.',
      context: { ...context, profileId: 'another-worker' }, useMemory: true,
    }, graph)
    expect(mia.retrievedMemory.some((memory) => memory.scope === 'personal')).toBe(true)
    expect(anotherWorker.retrievedMemory.some((memory) => memory.scope === 'personal')).toBe(false)
  })

  it('never exposes a rejected candidate route to ranking', async () => {
    const graph = new InMemoryCapacityGraph()
    const first = await recommend({ action: 'recommend', brief: 'Get me to East Richmond by 4:20pm.', context, useMemory: true }, graph)
    const stored = await recordOutcome({
      action: 'outcome', decisionId: first.decisionId, capacityUnitId: first.recommendation!.id,
      demand: first.demand, context, feedback: 'better', metrics: { elapsedSeconds: 500 }, shareTrace: true,
      journeyTrace: [[-37.83036, 144.99455], [-37.8295, 144.996], [-37.8286, 144.9972]],
    }, graph)
    await reviewCandidateRoute({
      action: 'candidate-route-review', candidateCapacityId: stored.candidateCapacityId!, decision: 'reject',
      reason: 'The trace crosses a restricted access boundary.',
    }, graph)
    const response = await recommend({ action: 'recommend', brief: 'Get me to East Richmond by 4:20pm.', context, useMemory: true }, graph)
    expect(response.options.some((option) => option.id === stored.candidateCapacityId)).toBe(false)
  })

  it('turns repeated room reports into reviewable evidence before cohort reweighting', async () => {
    const graph = new InMemoryCapacityGraph()
    for (const profileId of ['worker-1', 'worker-2', 'worker-3']) {
      const workerContext = { ...context, profileId }
      const decision = await recommend({
        action: 'recommend', brief: 'I need a room for six people at 2pm for 45 minutes with hybrid equipment.',
        context: workerContext, useMemory: true,
      }, graph)
      await recordOutcome({
        action: 'outcome', decisionId: decision.decisionId, capacityUnitId: 'workspace-boardroom',
        demand: decision.demand, context: workerContext, feedback: 'worse', metrics: {},
        workspaceIssues: [{ issue: 'acoustics', detail: 'Remote participants could not hear clearly.', severity: 2 }],
      }, graph)
    }

    const candidates = await listWorkspaceIssues({ action: 'workspace-issues', status: 'candidate' }, graph)
    expect(candidates.issues).toHaveLength(1)
    expect(candidates.issues[0]).toMatchObject({
      capacityUnitId: 'workspace-boardroom', issue: 'acoustics', independentReporterCount: 3,
    })

    const reviewed = await reviewWorkspaceIssue({
      action: 'workspace-issue-review', issueId: candidates.issues[0].id, decision: 'validate',
      reason: 'Repeated hybrid calls showed the same acoustic issue.',
    }, graph)
    expect(reviewed.issue.status).toBe('validated')

    const next = await recommend({
      action: 'recommend', brief: 'I need a room for six people at 2pm for 45 minutes with hybrid equipment.',
      context: { ...context, profileId: 'worker-4' }, useMemory: true,
    }, graph)
    expect(next.retrievedMemory).toEqual(expect.arrayContaining([
      expect.objectContaining({ capacityUnitId: 'workspace-boardroom', scope: 'cohort', requirement: 'hybrid' }),
    ]))
  })
})
