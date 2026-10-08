import { describe, expect, it } from 'vitest'
import { handleOperationsRequest } from '../api/operations'

describe('CDH operations API', () => {
  it('publishes the Cremorne asset registry and named integration contracts', async () => {
    const response = handleOperationsRequest(new Request('https://example.test/api/operations'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.precinct).toBe('Cremorne')
    expect(body.assets.sensors).toHaveLength(6)
    expect(body.assets.sensors.every((sensor: { position?: number[] }) => sensor.position?.length === 2)).toBe(true)
    expect(body.assets.venues.map((venue: { name: string }) => venue.name)).toContain('CDH Boardroom')
    expect(body.integrations.map((integration: { id: string }) => integration.id)).toEqual([
      'decision-api',
      'smart-poles',
      'room-availability',
      'pilot-identity',
    ])
  })

  it('exposes a read-only registry', async () => {
    const response = handleOperationsRequest(new Request('https://example.test/api/operations', { method: 'POST' }))
    expect(response.status).toBe(405)
  })
})
