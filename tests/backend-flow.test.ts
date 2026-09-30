import { describe, expect, it } from 'vitest'
import { recommend, recordOutcome } from '../server/decision-service'
import { InMemoryCapacityGraph } from '../server/graph'
import type { DecisionContext } from '../src/api-contracts'

const context: DecisionContext = {
  uvIndex: 8.2,
  temperature: 31,
  crowding: 82,
  workers: 65,
  requestedAt: '2026-09-30T16:00:00.000+10:00',
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
  })
})
