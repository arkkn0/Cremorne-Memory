type OpenMeteoPayload = {
  hourly?: {
    time?: string[]
    temperature_2m?: number[]
    uv_index?: number[]
  }
}

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast?latitude=-37.83&longitude=144.995&hourly=temperature_2m%2Cuv_index&forecast_days=2&timezone=Australia%2FSydney'

export const config = { runtime: 'nodejs', maxDuration: 10 }

export async function handleContextRequest(request: Request, fetcher: typeof fetch = fetch) {
  if (request.method !== 'GET') return Response.json({ error: 'Method not allowed.' }, { status: 405 })
  try {
    const response = await fetcher(FORECAST_URL, { headers: { accept: 'application/json' } })
    if (!response.ok) throw new Error(`Open-Meteo returned ${response.status}`)
    const payload = await response.json() as OpenMeteoPayload
    const times = payload.hourly?.time ?? []
    const temperatures = payload.hourly?.temperature_2m ?? []
    const uvValues = payload.hourly?.uv_index ?? []
    const forecast = times.flatMap((time, index) => {
      const temperature = Number(temperatures[index])
      const uvIndex = Number(uvValues[index])
      return Number.isFinite(temperature) && Number.isFinite(uvIndex) ? [{ time, temperature, uvIndex }] : []
    })
    if (!forecast.length) throw new Error('Open-Meteo returned no usable hourly forecast.')
    return Response.json({
      source: 'Open-Meteo · Cremorne coordinates',
      fetchedAt: new Date().toISOString(),
      forecast,
    }, { headers: { 'Cache-Control': 's-maxage=900, stale-while-revalidate=3600' } })
  } catch {
    return Response.json({ error: 'Forecast unavailable.' }, { status: 503 })
  }
}

export default { fetch: handleContextRequest }
