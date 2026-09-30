import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet'
import type { EvaluatedProductRoute } from './product'
import { productContext } from './product'
import type { JourneyPoint } from './journey-trace'

const routeColours = ['#ff5c3b', '#6d7c78', '#1d7f69']

function FitRoute({ routes }: { routes: EvaluatedProductRoute[] }) {
  const map = useMap()
  useEffect(() => {
    const points = routes.flatMap((route) => route.coordinates)
    if (points.length) map.fitBounds(points, { padding: [42, 42] })
  }, [map, routes])
  return null
}

function FollowJourney({ point }: { point?: JourneyPoint }) {
  const map = useMap()
  useEffect(() => {
    if (point) map.panTo(point, { animate: true, duration: 0.8 })
  }, [map, point])
  return null
}

export default function CremorneMap({
  routes,
  selectedId,
  onSelect,
  showTrees,
  showFlow = false,
  journeyTrace = [],
  candidateTraces = [],
}: {
  routes: EvaluatedProductRoute[]
  selectedId?: string
  onSelect: (id: string) => void
  showTrees: boolean
  showFlow?: boolean
  journeyTrace?: JourneyPoint[]
  candidateTraces?: Array<{ id: string; name: string; points: JourneyPoint[]; status: string }>
}) {
  const [flowTick, setFlowTick] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setFlowTick((value) => (value + 1) % 120), 180)
    return () => window.clearInterval(timer)
  }, [])

  const activeRoute = routes.find((route) => route.id === selectedId) ?? routes.find((route) => route.recommended)
  const guidedPosition = journeyTrace.at(-1)
  const movingWorkers = useMemo(() => {
    if (!activeRoute?.coordinates.length) return []
    return Array.from({ length: 9 }, (_, index) => {
      const progress = ((flowTick / 120) + index / 9) % 1
      const coordinateIndex = Math.min(activeRoute.coordinates.length - 1, Math.floor(progress * activeRoute.coordinates.length))
      return activeRoute.coordinates[coordinateIndex]
    })
  }, [activeRoute, flowTick])

  return (
    <MapContainer center={[-37.8282, 144.994]} zoom={16} zoomControl={false} attributionControl className="cremorne-map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitRoute routes={routes} />
      <FollowJourney point={guidedPosition} />

      {showTrees && productContext.trees.map((tree) => (
        <CircleMarker
          key={tree.id}
          center={tree.position}
          radius={Math.max(2, Math.min(5, tree.radiusM))}
          pathOptions={{ color: '#1d7f69', fillColor: '#1d7f69', fillOpacity: 0.45, weight: 0 }}
        >
          <Tooltip direction="top">Vicmap tree · canopy radius {tree.radiusM.toFixed(1)} m</Tooltip>
        </CircleMarker>
      ))}

      {routes.slice().reverse().map((route) => {
        const sourceIndex = Math.max(0, Number(route.id.split('-').at(-1)) - 1)
        const selected = selectedId === route.id
        return (
          <Polyline
            key={route.id}
            positions={route.coordinates}
            eventHandlers={{ click: () => onSelect(route.id) }}
            pathOptions={{
              color: route.eligible ? (selected ? '#1d7f69' : routeColours[sourceIndex] ?? '#4475a6') : '#909a96',
              opacity: route.eligible ? (selected ? 1 : 0.58) : 0.42,
              weight: selected ? 8 : 5,
              dashArray: route.eligible ? undefined : '8 8',
              className: selected ? 'route-flow-line' : undefined,
            }}
          >
            <Tooltip sticky>{route.name} · {route.durationMin} min</Tooltip>
          </Polyline>
        )
      })}

      {showFlow && movingWorkers.map((position, index) => (
        <CircleMarker
          key={`demand-${activeRoute?.id}-${index}`}
          center={position}
          radius={index % 3 === 0 ? 4 : 3}
          pathOptions={{ color: '#202521', fillColor: '#ffd85a', fillOpacity: 1, weight: 1.5 }}
        ><Tooltip>Estimated arrival flow in this time band</Tooltip></CircleMarker>
      ))}

      {journeyTrace.length > 1 && <Polyline positions={journeyTrace} pathOptions={{ color: '#ffd85a', opacity: 1, weight: 7, className: 'actual-journey-line' }}><Tooltip>Your walked path</Tooltip></Polyline>}
      {candidateTraces.filter((candidate) => candidate.points.length > 1).map((candidate) => <Polyline key={candidate.id} positions={candidate.points} pathOptions={{ color: candidate.status === 'validated' ? '#1d7f69' : '#ff6542', opacity: .92, weight: 6, dashArray: candidate.status === 'validated' ? undefined : '14 9' }}><Tooltip>{candidate.name} · {candidate.status}</Tooltip></Polyline>)}
      {guidedPosition && <CircleMarker center={guidedPosition} radius={9} pathOptions={{ color: '#fff', fillColor: '#202521', fillOpacity: 1, weight: 4 }}><Tooltip permanent direction="top" offset={[0, -10]}>You</Tooltip></CircleMarker>}

      <CircleMarker center={productContext.places.cdh.position} radius={8} pathOptions={{ color: '#232824', fillColor: '#ffd85a', fillOpacity: 1, weight: 3 }}>
        <Tooltip permanent direction="right" offset={[10, 0]} className="place-label">CDH</Tooltip>
        <Popup><strong>Cremorne Digital Hub</strong><br />80 Balmain Street</Popup>
      </CircleMarker>
      {Object.entries(productContext.places).filter(([id]) => id !== 'cdh').map(([id, place]) => (
        <CircleMarker key={id} center={place.position} radius={7} pathOptions={{ color: '#232824', fillColor: '#f7f1e7', fillOpacity: 1, weight: 3 }}>
          <Tooltip permanent direction="left" offset={[-9, 0]} className="place-label">{place.name}</Tooltip>
          <Popup><strong>{place.name}</strong><br />{place.pmPeakEntries?.toLocaleString()} PM-peak station entries</Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
