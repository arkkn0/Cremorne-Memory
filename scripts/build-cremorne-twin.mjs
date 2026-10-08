import { writeFile } from 'node:fs/promises'

const bounds = { south: -37.8332, west: 144.9876, north: -37.8227, east: 145.0014 }
const bbox = `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`
const endpoint = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${bbox}`
const response = await fetch(endpoint, {
  headers: { 'user-agent': 'CremorneMemory-CDH-Pilot/1.0' },
  signal: AbortSignal.timeout(90_000),
})
if (!response.ok) throw new Error(`OpenStreetMap API returned ${response.status}`)
const payload = await response.json()
const nodes = new Map(payload.elements
  .filter((element) => element.type === 'node')
  .map((node) => [node.id, [node.lon, node.lat]]))
const ways = payload.elements
  .filter((element) => element.type === 'way' && element.nodes?.length > 1)
  .map((way) => ({ ...way, geometry: way.nodes.map((id) => nodes.get(id)).filter(Boolean) }))
  .filter((way) => way.geometry.length > 1)
const roads = ways.filter((way) => way.tags?.highway || way.tags?.railway).map((way) => ({
  id: String(way.id),
  kind: way.tags?.railway ? `railway:${way.tags.railway}` : `highway:${way.tags?.highway || 'road'}`,
  name: way.tags?.name || '',
  coordinates: way.geometry,
}))
const buildings = ways.filter((way) => way.tags?.building).map((way) => ({
  id: String(way.id),
  kind: way.tags.building,
  coordinates: way.geometry,
}))

const output = {
  generatedAt: new Date().toISOString(),
  source: 'OpenStreetMap contributors via OSM API 0.6',
  licence: 'ODbL',
  bounds,
  roads,
  buildings,
}
await writeFile(new URL('../src/cremorne-twin-geometry.json', import.meta.url), `${JSON.stringify(output)}\n`)
console.log(`Cremorne twin geometry: ${roads.length} road/rail ways, ${buildings.length} buildings`)
