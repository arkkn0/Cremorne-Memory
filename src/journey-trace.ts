export type JourneyPoint = [number, number]

const EARTH_METRES = 6_371_000

function radians(value: number) {
  return value * Math.PI / 180
}

export function distanceMetres(a: JourneyPoint, b: JourneyPoint) {
  const lat = radians(b[0] - a[0])
  const lng = radians(b[1] - a[1])
  const first = radians(a[0])
  const second = radians(b[0])
  const h = Math.sin(lat / 2) ** 2 + Math.cos(first) * Math.cos(second) * Math.sin(lng / 2) ** 2
  return 2 * EARTH_METRES * Math.asin(Math.sqrt(h))
}

export function traceLengthMetres(points: JourneyPoint[]) {
  return points.slice(1).reduce((total, point, index) => total + distanceMetres(points[index], point), 0)
}

export function distanceToPolyline(point: JourneyPoint, line: JourneyPoint[]) {
  if (!line.length) return Number.POSITIVE_INFINITY
  if (line.length === 1) return distanceMetres(point, line[0])
  return Math.min(...line.slice(1).map((end, index) => distanceToSegmentMetres(point, line[index], end)))
}

function distanceToSegmentMetres(point: JourneyPoint, start: JourneyPoint, end: JourneyPoint) {
  const latitude = radians(point[0])
  const toLocal = ([lat, lng]: JourneyPoint) => ({
    x: radians(lng - point[1]) * EARTH_METRES * Math.cos(latitude),
    y: radians(lat - point[0]) * EARTH_METRES,
  })
  const a = toLocal(start)
  const b = toLocal(end)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  if (!lengthSquared) return Math.hypot(a.x, a.y)
  const projection = Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / lengthSquared))
  return Math.hypot(a.x + projection * dx, a.y + projection * dy)
}

export function isDistinctJourneyTrace(actual: JourneyPoint[], planned: JourneyPoint[]) {
  if (actual.length < 3 || planned.length < 2) return false
  const sample = actual.filter((_, index) => index % Math.max(1, Math.floor(actual.length / 12)) === 0)
  const offRoute = sample.filter((point) => distanceToPolyline(point, planned) > 28).length
  const lengthDifference = Math.abs(traceLengthMetres(actual) - traceLengthMetres(planned))
  return offRoute / sample.length >= 0.25 || lengthDifference >= 90
}

export function simulatedJourneyTrace(planned: JourneyPoint[], progress: number) {
  if (!planned.length) return []
  const lastIndex = Math.max(1, Math.ceil((planned.length - 1) * Math.min(1, Math.max(0, progress))))
  return planned.slice(0, lastIndex + 1)
}
