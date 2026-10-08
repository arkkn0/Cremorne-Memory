import { useEffect, useRef } from 'react'
import { Deck } from '@deck.gl/core'
import { PathLayer, PolygonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import type { EvaluatedProductRoute, ProductContext } from './product'
import type { CandidateRouteRecord } from './api-contracts'
import type { PrecinctAsset } from './cdh-operations'
import twinGeometry from './cremorne-twin-geometry.json'

type TwinRoute = EvaluatedProductRoute & { coordinates: [number, number][] }
type FlowDatum = { routeId: string; name: string; path: [number, number][]; offset: number; color: [number, number, number] }
type StreetDatum = { id: string; kind: string; name: string; coordinates: [number, number][] }
type BuildingDatum = { id: string; kind: string; coordinates: [number, number][] }

const streets = twinGeometry.roads as unknown as StreetDatum[]
const buildings = twinGeometry.buildings as unknown as BuildingDatum[]

const toLngLat = ([lat, lng]: [number, number]): [number, number] => [lng, lat]
const routeColor = (route: TwinRoute, selectedId: string): [number, number, number] => route.id === selectedId
  ? [255, 204, 0]
  : route.recommended ? [20, 126, 99] : [67, 86, 102]
const streetColor = (street: StreetDatum): [number, number, number, number] => {
  if (street.kind.startsWith('railway:')) return [104, 114, 124, 185]
  if (/motorway|trunk|primary/.test(street.kind)) return [133, 145, 151, 205]
  if (/secondary|tertiary/.test(street.kind)) return [154, 166, 170, 190]
  if (/footway|path|pedestrian/.test(street.kind)) return [169, 180, 177, 150]
  return [185, 194, 191, 165]
}
const streetWidth = (street: StreetDatum) => {
  if (street.kind.startsWith('railway:')) return 2.2
  if (/motorway|trunk|primary/.test(street.kind)) return 3.4
  if (/secondary|tertiary/.test(street.kind)) return 2.6
  if (/footway|path|pedestrian/.test(street.kind)) return 1.1
  return 1.6
}
const pointOnPath = (path: [number, number][], progress: number): [number, number] => {
  if (path.length < 2) return path[0] ?? [144.9954, -37.8283]
  const scaled = Math.max(0, Math.min(0.999, progress)) * (path.length - 1)
  const index = Math.floor(scaled)
  const fraction = scaled - index
  const start = path[index]
  const end = path[index + 1]
  return [start[0] + (end[0] - start[0]) * fraction, start[1] + (end[1] - start[1]) * fraction]
}

export default function CremorneTwin({
  routes,
  selectedId,
  onSelect,
  expectedWorkers,
  context,
  sensors,
  candidateRoutes,
}: {
  routes: TwinRoute[]
  selectedId: string
  onSelect: (routeId: string) => void
  expectedWorkers: number
  context: ProductContext
  sensors: PrecinctAsset[]
  candidateRoutes: CandidateRouteRecord[]
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const deckRef = useRef<Deck | null>(null)
  const onSelectRef = useRef(onSelect)

  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])

  useEffect(() => {
    if (!containerRef.current || deckRef.current) return
    const deck = new Deck({
      parent: containerRef.current,
      initialViewState: {
        longitude: 144.9954,
        latitude: -37.8283,
        zoom: 15.65,
        pitch: 38,
        bearing: -14,
      },
      controller: true,
      useDevicePixels: true,
      width: '100%',
      height: '100%',
      style: { background: '#eef2ef', position: 'absolute', inset: '0' },
      layers: [],
    })
    deckRef.current = deck
    return () => {
      deck.finalize()
      deckRef.current = null
    }
  }, [])

  useEffect(() => {
    const deck = deckRef.current
    if (!deck) return
    let frame = 0
    let startedAt = performance.now()
    const copies = Math.max(1, Math.min(5, Math.round(expectedWorkers / 900)))
    const routePaths = routes.map((route) => ({ ...route, path: route.coordinates.map(toLngLat) }))
    const flowData: FlowDatum[] = routePaths.flatMap((route) => Array.from({ length: copies }, (_, copy) => ({
      routeId: route.id,
      name: route.name,
      path: route.path,
      offset: copy / copies,
      color: routeColor(route, selectedId),
    })))
    const treePoints = context.trees.map((tree) => ({ ...tree, coordinates: toLngLat(tree.position) }))
    const sensorPoints = sensors.flatMap((sensor) => sensor.position ? [{ ...sensor, coordinates: toLngLat(sensor.position) }] : [])
    const cdhPosition = toLngLat(context.places.cdh.position)
    const placeLabels = [
      { position: cdhPosition, label: 'CDH | 3 spaces', emphasis: true },
      { position: toLngLat(context.places.richmond.position), label: 'Richmond Station', emphasis: false },
      { position: toLngLat(context.places['east-richmond'].position), label: 'East Richmond', emphasis: false },
    ]
    const candidateData = candidateRoutes.filter((route) => route.geometry.length > 1).map((route) => ({ ...route, path: route.geometry.map(toLngLat) }))

    const render = (now: number) => {
      if (now - startedAt > 24000) startedAt = now
      const phase = ((now - startedAt) / 24_000) % 1
      const pulse = 1 + 0.16 * Math.sin(now / 360)
      const movingDemand = flowData.map((item) => ({
        ...item,
        position: pointOnPath(item.path, (phase + item.offset) % 1),
      }))
      deck.setProps({
        layers: [
          new PolygonLayer({
            id: 'osm-buildings',
            data: buildings,
            getPolygon: (item) => item.coordinates,
            getFillColor: [221, 226, 223, 240],
            getLineColor: [182, 193, 189, 210],
            getLineWidth: 0.7,
            lineWidthUnits: 'pixels',
            stroked: true,
            filled: true,
            pickable: false,
          }),
          new PathLayer({
            id: 'osm-street-network',
            data: streets,
            getPath: (item) => item.coordinates,
            getColor: streetColor,
            getWidth: streetWidth,
            widthUnits: 'pixels',
            capRounded: true,
            jointRounded: true,
            pickable: false,
          }),
          new ScatterplotLayer({
            id: 'vicmap-tree-canopy',
            data: treePoints,
            getPosition: (item) => item.coordinates,
            getRadius: (item) => Math.max(2, Math.min(9, item.radiusM * 0.32)),
            radiusUnits: 'meters',
            getFillColor: (item) => item.denseCanopy ? [35, 124, 80, 78] : [67, 142, 99, 45],
            stroked: false,
            pickable: false,
          }),
          new PathLayer({
            id: 'route-capacity',
            data: routePaths,
            getPath: (route) => route.path,
            getColor: (route) => [...routeColor(route, selectedId), route.id === selectedId ? 245 : 150],
            getWidth: (route) => route.id === selectedId ? 8 : route.recommended ? 5 : 3,
            widthUnits: 'pixels',
            jointRounded: true,
            capRounded: true,
            pickable: true,
            onClick: ({ object }) => object && onSelectRef.current(object.id),
          }),
          new ScatterplotLayer({
            id: 'time-of-use-flow',
            data: movingDemand,
            getPosition: (item) => item.position,
            getRadius: (item) => item.routeId === selectedId ? 5 : 3.5,
            radiusUnits: 'pixels',
            getFillColor: (item) => [item.color[0], item.color[1], item.color[2], 240] as [number, number, number, number],
            getLineColor: [255, 255, 255, 220],
            lineWidthMinPixels: 1,
            stroked: true,
            pickable: false,
          }),
          new PathLayer({
            id: 'candidate-routes',
            data: candidateData,
            getPath: (item) => item.path,
            getColor: [125, 91, 166, 205],
            getWidth: 3,
            widthUnits: 'pixels',
            getDashArray: [5, 4],
            dashJustified: true,
            pickable: false,
          }),
          new ScatterplotLayer({
            id: 'sensor-pulse',
            data: sensorPoints,
            getPosition: (item) => item.coordinates,
            getRadius: 16 * pulse,
            radiusUnits: 'pixels',
            getFillColor: [255, 213, 42, 32],
            getLineColor: [255, 193, 0, 140],
            lineWidthMinPixels: 1,
            stroked: true,
            pickable: false,
          }),
          new ScatterplotLayer({
            id: 'sensor-sites',
            data: sensorPoints,
            getPosition: (item) => item.coordinates,
            getRadius: 5,
            radiusUnits: 'pixels',
            getFillColor: [255, 200, 0, 255],
            getLineColor: [23, 33, 43, 255],
            lineWidthMinPixels: 2,
            stroked: true,
            pickable: true,
          }),
          new ScatterplotLayer({
            id: 'cdh-capacity',
            data: [{ coordinates: cdhPosition }],
            getPosition: (item) => item.coordinates,
            getRadius: 12,
            radiusUnits: 'pixels',
            getFillColor: [23, 33, 43, 255],
            getLineColor: [255, 213, 42, 255],
            lineWidthMinPixels: 4,
            stroked: true,
          }),
          new TextLayer({
            id: 'twin-labels',
            data: placeLabels,
            getPosition: (item) => item.position,
            getText: (item) => item.label,
            getColor: [23, 33, 43, 255],
            getSize: (item) => item.emphasis ? 13 : 12,
            getPixelOffset: [0, -24],
            background: true,
            getBackgroundColor: [255, 255, 255, 235],
            backgroundPadding: [7, 4],
            fontWeight: 700,
          }),
        ],
        getTooltip: ({ object, layer }) => {
          if (!object) return null
          if (layer?.id === 'route-capacity') return { text: `${object.name}\n${object.durationMin} min · ${object.canopyAdjacentPct}% canopy adjacency` }
          if (layer?.id === 'sensor-sites') return { text: `${object.address}\nPublished smart-pole location` }
          return null
        },
      })
      frame = requestAnimationFrame(render)
    }
    frame = requestAnimationFrame(render)
    return () => cancelAnimationFrame(frame)
  }, [candidateRoutes, context, expectedWorkers, routes, selectedId, sensors])

  return (
    <div className="cremorne-twin">
      <div ref={containerRef} className="cremorne-twin__map" />
      <div className="twin-layer-key" aria-label="Digital twin layers">
        <span><i className="is-flow" /> Demand flow</span>
        <span><i className="is-sensor" /> 6 smart-pole locations</span>
        <span><i className="is-tree" /> Vicmap canopy</span>
      </div>
      <a className="twin-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a>
    </div>
  )
}
