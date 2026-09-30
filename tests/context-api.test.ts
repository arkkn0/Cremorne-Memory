import { describe, expect, it, vi } from 'vitest'
import { handleContextRequest } from '../api/context'

describe('real-time context API', () => {
  it('returns a validated Cremorne-coordinate forecast', async () => {
    const fetcher = vi.fn(async () => Response.json({
      hourly: {
        time: ['2026-10-01T16:00'],
        temperature_2m: [15.8],
        uv_index: [0.8],
      },
    })) as unknown as typeof fetch
    const response = await handleContextRequest(new Request('https://example.test/api/context'), fetcher)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      source: 'Open-Meteo · Cremorne coordinates',
      forecast: [{ time: '2026-10-01T16:00', temperature: 15.8, uvIndex: 0.8 }],
    })
    expect(response.headers.get('cache-control')).toContain('s-maxage=900')
  })

  it('does not substitute a made-up forecast when the public feed fails', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 503 })) as unknown as typeof fetch
    const response = await handleContextRequest(new Request('https://example.test/api/context'), fetcher)

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Forecast unavailable.' })
  })
})
