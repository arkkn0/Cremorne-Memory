import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(scriptDir, '..')
const rawDir = path.join(root, 'public', 'data', 'raw')

const readJson = (name) => JSON.parse(fs.readFileSync(path.join(rawDir, name), 'utf8'))

function decodePolyline(encoded, precision = 6) {
  const factor = 10 ** precision
  const coordinates = []
  let index = 0
  let lat = 0
  let lon = 0

  while (index < encoded.length) {
    let result = 0
    let shift = 0
    let byte
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lat += result & 1 ? ~(result >> 1) : result >> 1

    result = 0
    shift = 0
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lon += result & 1 ? ~(result >> 1) : result >> 1

    coordinates.push([lat / factor, lon / factor])
  }

  return coordinates
}

function haversineM(a, b) {
  const radians = (value) => (value * Math.PI) / 180
  const earthRadius = 6371000
  const dLat = radians(b[0] - a[0])
  const dLon = radians(b[1] - a[1])
  const lat1 = radians(a[0])
  const lat2 = radians(b[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * earthRadius * Math.asin(Math.sqrt(h))
}

function interpolate(a, b, fraction) {
  return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction]
}

function pointToRouteDistance(point, route) {
  let closest = Infinity
  for (let index = 1; index < route.length; index += 1) {
    const a = route[index - 1]
    const b = route[index]
    const segmentLength = haversineM(a, b)
    const samples = Math.max(1, Math.ceil(segmentLength / 12))
    for (let sample = 0; sample <= samples; sample += 1) {
      closest = Math.min(closest, haversineM(point, interpolate(a, b, sample / samples)))
    }
  }
  return closest
}

function canopyMetrics(route, trees) {
  let totalM = 0
  let canopyAdjacentM = 0

  for (let index = 1; index < route.length; index += 1) {
    const a = route[index - 1]
    const b = route[index]
    const length = haversineM(a, b)
    totalM += length
    const midpoint = interpolate(a, b, 0.5)
    const covered = trees.some((tree) => haversineM(midpoint, tree.position) <= tree.radiusM + 5)
    if (covered) canopyAdjacentM += length
  }

  const nearbyTrees = trees.filter((tree) => pointToRouteDistance(tree.position, route) <= 20).length
  return {
    canopyAdjacentPct: Math.min(100, Math.round((canopyAdjacentM / Math.max(1, totalM)) * 100)),
    nearbyTreeCount: nearbyTrees,
  }
}

function parseStationCsv() {
  const lines = fs.readFileSync(path.join(rawDir, 'station-patronage-2024-25.csv'), 'utf8').trim().split(/\r?\n/)
  const headers = lines[0].split(',')
  return lines.slice(1).map((line) => {
    const values = line.split(',')
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]))
  })
}

function stationRecord(rows, name) {
  const row = rows.find((candidate) => candidate.Stop_name === name)
  if (!row) throw new Error(`Station not found: ${name}`)
  return {
    id: row.Stop_ID,
    name: row.Stop_name,
    position: [Number(row.Stop_lat), Number(row.Stop_long)],
    weekdayEntries: Number(row.Pax_weekday),
    normalWeekdayEntries: Number(row.Pax_norm_weekday),
    amPeakEntries: Number(row.Pax_AM_peak),
    pmPeakEntries: Number(row.Pax_PM_peak),
    period: row.Fin_year,
  }
}

const treeGeoJson = readJson('vicmap-trees-cremorne.geojson')
const allTrees = treeGeoJson.features.map((feature) => ({
  id: feature.properties.ufi,
  position: [feature.geometry.coordinates[1], feature.geometry.coordinates[0]],
  radiusM: Number(feature.properties.canopy_radius_m || 0),
  heightM: Number(feature.properties.height_m || 0),
  denseCanopy: feature.properties.dense_canopy === 'Y',
}))

function buildRoutes(fileName, reverse, routeSetId) {
  const raw = readJson(fileName)
  const trips = [raw.trip, ...(raw.alternates || []).map((entry) => entry.trip)]

  return trips.map((trip, index) => {
    let coordinates = decodePolyline(trip.legs[0].shape)
    if (reverse) coordinates = coordinates.reverse()
    const canopy = canopyMetrics(coordinates, allTrees)
    return {
      id: `${routeSetId}-${index + 1}`,
      label: index === 0 ? 'Direct route' : `Alternative ${index}`,
      coordinates: coordinates.map(([lat, lon]) => [Number(lat.toFixed(6)), Number(lon.toFixed(6))]),
      distanceM: Math.round(trip.summary.length * 1000),
      durationMin: Number((trip.summary.time / 60).toFixed(1)),
      ...canopy,
      stepFreeEvidence: 'unverified',
      geometrySource: 'Valhalla pedestrian routing over OpenStreetMap',
    }
  })
}

const routeSets = {
  richmond: buildRoutes('valhalla-richmond-cdh.json', true, 'richmond'),
  'east-richmond': buildRoutes('valhalla-cdh-east-richmond.json', false, 'east-richmond'),
}

const relevantTrees = allTrees
  .filter((tree) => Object.values(routeSets).flat().some((route) => pointToRouteDistance(tree.position, route.coordinates) <= 80))
  .slice(0, 700)

const stationRows = parseStationCsv()
const generatedAt = new Date().toISOString()
const context = {
  generatedAt,
  evidenceModel: {
    live: ['Open-Meteo temperature and UV when available'],
    publicBaseline: ['DTP station patronage', 'Vicmap urban trees', 'OpenStreetMap route geometry'],
    simulated: ['minute-level pedestrian load', 'route capacity', 'intervention outcomes', 'space availability'],
  },
  places: {
    cdh: { id: 'cdh', name: 'Cremorne Digital Hub', address: '80 Balmain Street, Cremorne', position: [-37.830362, 144.994553] },
    richmond: stationRecord(stationRows, 'Richmond'),
    'east-richmond': stationRecord(stationRows, 'East Richmond'),
  },
  routeSets,
  trees: relevantTrees,
  spaces: [
    { id: 'boardroom', name: 'CDH Boardroom', capacity: 12, mode: 'Meeting', facilities: ['Display', 'Video call'], accessible: true, availability: ['14:00–15:00', '16:00–17:30'], availabilityStatus: 'demonstration' },
    { id: 'workshop', name: 'CDH Workshop Room', capacity: 24, standingCapacity: 40, mode: 'Workshop', facilities: ['Display', 'Flexible seating'], accessible: true, availability: ['13:30–15:30'], availabilityStatus: 'demonstration' },
    { id: 'event', name: 'CDH Main Event Space', capacity: 80, standingCapacity: 100, mode: 'Event', facilities: ['AV', 'Flexible layout'], accessible: true, availability: [], availabilityStatus: 'demonstration' },
  ],
  sources: [
    { label: 'DTP annual metropolitan station patronage FY24–25', url: 'https://opendata.transport.vic.gov.au/dataset/annual-metropolitan-train-station-patronage-station-entries', licence: 'Victorian Government open data' },
    { label: 'Vicmap Vegetation — Tree Urban', url: 'https://discover.data.vic.gov.au/dataset/vicmap-vegetation-tree-urban-rest-api', licence: 'CC BY 4.0' },
    { label: 'OpenStreetMap / Valhalla pedestrian route geometry', url: 'https://www.openstreetmap.org/copyright', licence: 'ODbL' },
    { label: 'Cremorne Digital Hub venue capacities', url: 'https://www.cremornedigitalhub.com.au/events/', licence: 'Public venue information' },
  ],
}

for (const destination of [
  path.join(root, 'public', 'data', 'cremorne-context.json'),
  path.join(root, 'src', 'cremorne-context.json'),
]) {
  fs.writeFileSync(destination, `${JSON.stringify(context, null, 2)}\n`)
}

console.log(`Built Cremorne context with ${relevantTrees.length} route-adjacent trees.`)
for (const [key, routes] of Object.entries(routeSets)) {
  console.log(key, routes.map((route) => `${route.durationMin} min / ${route.canopyAdjacentPct}% canopy-adjacent`).join(' | '))
}
