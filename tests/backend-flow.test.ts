import { describe, expect, it } from 'vitest'
import { listCandidateRoutes, recommend, recordOutcome, reviewCandidateRoute } from '../server/decision-service'
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
  it('retrieves the low-UV exception and changes the eligible set', async () => {
    const graph = new InMemoryCapacityGraph()
    const withoutMemory = await recommend({ action: 'recommend', brief: 'Get me to East Richmond by 4:20pm and avoid direct sun.', context, useMemory: false }, graph)
    const withMemory = await recommend({ action: 'recommend', brief: 'Get me to East Richmond by 4:20pm and avoid direct sun.', context, useMemory: true }, graph)

    expect(withoutMemory.options.find((option) => option.name.includes('Route B'))?.eligible).toBe(true)
    expect(withMemory.options.find((option) => option.name.includes('Route B'))?.eligible).toBe(false)
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

  it('uses the same graph for a room × time request', async () => {
    const response = await recommend({ action: 'recommend', brief: 'I need a room for six people at 2pm for 45 minutes with hybrid equipment and a display.', context, useMemory: true }, new InMemoryCapacityGraph())
    expect(response.demand.intent).toBe('workspace')
    expect(response.recommendation).toMatchObject({ productId: 'boardroom', availableFrom: '14:00', availableUntil: '14:45' })
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
})
