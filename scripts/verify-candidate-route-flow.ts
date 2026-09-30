import { listCandidateRoutes, recommend, recordOutcome, reviewCandidateRoute } from '../server/decision-service.js'

if (!process.env.NEO4J_URI || !process.env.NEO4J_USERNAME || !process.env.NEO4J_PASSWORD) {
  throw new Error('Set NEO4J_URI, NEO4J_USERNAME and NEO4J_PASSWORD before running this Neo4j verification.')
}

const runId = Date.now()

const context = {
  uvIndex: 8.2,
  temperature: 31,
  crowding: 82,
  workers: 65,
  requestedAt: new Date().toISOString(),
  profileId: `candidate-smoke-${runId}`,
}

const first = await recommend({
  action: 'recommend',
  brief: 'Get me to East Richmond by 4:20pm.',
  context,
  useMemory: true,
})
if (!first.recommendation) throw new Error('No initial route was available.')

const outcome = await recordOutcome({
  action: 'outcome',
  decisionId: first.decisionId,
  capacityUnitId: first.recommendation.id,
  demand: first.demand,
  context,
  feedback: 'better',
  metrics: { elapsedSeconds: 510, predictedMinutes: 9, exposureIndex: 34 },
  shareTrace: true,
  journeyTrace: [[-37.83036, 144.99455], [-37.8298, 144.9954], [-37.8289, 144.9964]],
  candidateRouteName: `Neo4j smoke-test candidate path ${runId}`,
})
if (!outcome.candidateCapacityId) throw new Error('The candidate route was not created.')

const pending = await listCandidateRoutes({ action: 'candidate-routes', status: 'candidate' })
if (!pending.candidates.some((candidate) => candidate.id === outcome.candidateCapacityId)) {
  throw new Error('The candidate route could not be retrieved for CDH review.')
}

await reviewCandidateRoute({
  action: 'candidate-route-review',
  candidateCapacityId: outcome.candidateCapacityId,
  decision: 'validate',
  reason: 'Smoke-test controlled comparison passed.',
  evidence: { durationMinutes: 9, shadePercent: 46, directUvFactor: 0.58, safeCapacity: 34, confidence: 0.78 },
})

const second = await recommend({
  action: 'recommend',
  brief: 'Get me to East Richmond by 4:20pm and avoid direct sun.',
  context,
  useMemory: true,
})
const promoted = second.options.find((option) => option.id === outcome.candidateCapacityId)
if (second.graph !== 'neo4j') throw new Error('The verification fell back instead of querying Neo4j.')
if (!promoted?.eligible) {
  throw new Error('The validated route did not enter the next eligible set.')
}

console.log(JSON.stringify({
  graph: second.graph,
  candidateCapacityId: outcome.candidateCapacityId,
  status: 'validated',
  enteredEligibleSet: true,
  promotedOption: promoted.name,
}, null, 2))
