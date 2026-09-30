type JsonSchema = Record<string, unknown>

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null; refusal?: string | null } }>
}

export function llmConfigured() {
  return Boolean(process.env.LLM_API_KEY && process.env.LLM_MODEL)
}

export async function requestStructuredOutput<T>({
  name,
  schema,
  system,
  user,
}: {
  name: string
  schema: JsonSchema
  system: string
  user: string
}): Promise<T> {
  const apiKey = process.env.LLM_API_KEY
  const model = process.env.LLM_MODEL
  if (!apiKey || !model) throw new Error('LLM is not configured')

  const baseUrl = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name, strict: true, schema },
      },
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`LLM request failed (${response.status}): ${detail.slice(0, 240)}`)
  }

  const payload = await response.json() as ChatCompletionResponse
  const message = payload.choices?.[0]?.message
  if (message?.refusal) throw new Error(`LLM refused the request: ${message.refusal}`)
  if (!message?.content) throw new Error('LLM returned no structured content')
  return JSON.parse(message.content) as T
}

