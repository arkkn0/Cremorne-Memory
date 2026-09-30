import type { DecisionContext, RankedCapacityOption, StructuredDemand } from '../src/api-contracts'
import { llmConfigured, requestStructuredOutput } from './llm.js'

const explanationSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    overall: { type: 'string' },
    options: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { id: { type: 'string' }, explanation: { type: 'string' } },
        required: ['id', 'explanation'],
      },
    },
  },
  required: ['overall', 'options'],
} as const

type ExplanationPayload = { overall: string; options: Array<{ id: string; explanation: string }> }

export async function explainOptions(
  demand: StructuredDemand,
  context: DecisionContext,
  options: RankedCapacityOption[],
): Promise<{ overall: string; options: RankedCapacityOption[] }> {
  const fallback = fallbackExplanations(demand, options)
  if (!llmConfigured() || options.length === 0) return fallback

  try {
    const evidence = options.slice(0, 4).map((option) => ({
      id: option.id,
      name: option.name,
      eligible: option.eligible,
      durationMinutes: option.durationMinutes,
      remainingCapacity: option.remainingCapacity,
      shadePercent: option.shadePercent,
      exposureIndex: option.exposureIndex,
      facilities: option.facilities,
      reasons: option.reasons,
      localMemory: option.memory.map((memory) => memory.summary),
    }))
    const result = await requestStructuredOutput<ExplanationPayload>({
      name: 'cremorne_explanation',
      schema: explanationSchema,
      system: [
        'Write short product explanations grounded only in the supplied demand, context and graph evidence.',
        'Use one sentence per option, under 28 words. State the practical trade-off.',
        'Do not mention AI, rules, policies, GraphRAG, Neo4j, confidence frameworks or governance.',
        'Do not add facts or clinical labels that are absent from the demand.',
      ].join(' '),
      user: JSON.stringify({ demand, context, options: evidence }),
    })
    const byId = new Map(result.options.map((item) => [item.id, item.explanation]))
    return {
      overall: result.overall,
      options: fallback.options.map((option) => ({ ...option, explanation: byId.get(option.id) || option.explanation })),
    }
  } catch {
    return fallback
  }
}

function fallbackExplanations(demand: StructuredDemand, options: RankedCapacityOption[]) {
  const explained = options.map((option) => {
    let explanation = option.reasons[0] || 'This option is ranked from the current conditions and your request.'
    if (option.eligible && demand.intent === 'movement') {
      const timing = `${option.durationMinutes} minutes`
      const shade = option.shadePercent ? `${option.shadePercent}% shaded` : 'limited shade data'
      explanation = `${option.name} takes ${timing}, is ${shade}, and has ${Math.max(0, option.remainingCapacity)} estimated capacity remaining.`
      if (option.memory.length) explanation = `${option.memory[0].summary} ${option.name} is ranked using that local outcome.`
    }
    if (option.eligible && demand.intent === 'workspace') {
      explanation = `${option.name} fits ${demand.capacityRequired} people for the requested time and includes the required equipment.`
      if (option.memory.length) explanation += ` ${option.memory[0].summary}`
    }
    return { ...option, explanation }
  })
  const recommendation = explained.find((option) => option.recommended)
  return {
    overall: recommendation ? `${recommendation.name} best fits the current request.` : 'No option currently meets every required condition.',
    options: explained,
  }
}

