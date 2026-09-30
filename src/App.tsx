import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowLeft, ArrowRight, BrainCircuit, Building2, Check,
  CircleGauge, Clock3, FlaskConical, Home, Map as MapIcon,
  MessageSquare, Navigation, PencilLine, Play, RefreshCw, RotateCcw, ShieldAlert, Sparkles, Sun, ThermometerSun, Trees, Users, X,
} from 'lucide-react'
import CremorneMap from './CremorneMap'
import { currentDecisionContext, getCandidateRoutes, getWorkspaceIssues, recommendCapacity, recordGraphOutcome, reviewCandidateRoute, reviewWorkspaceIssue } from './api'
import type { CandidateRouteRecord, RecommendResponse, WorkspaceIssueKey, WorkspaceIssueRecord } from './api-contracts'
import { loadJourneyOutcomes, loadMemory, loadRoomExperiences, saveJourneyOutcome, saveRoomExperience } from './memory'
import type { RoomExperience } from './memory'
import type { MemoryRule } from './domain'
import {
  demandAtTime, evaluateProductRoutes, findSpaces, parseRouteBrief, parseSpaceBrief, productContext,
} from './product'
import type { EvaluatedProductRoute } from './product'
import { distanceMetres, isDistinctJourneyTrace, type JourneyPoint } from './journey-trace'

type ProductRole = 'demo' | 'worker' | 'operator'
type WorkerTask = 'route' | 'space'
type WorkerMode = 'mia' | 'explore'
type JourneyStage = 'setup' | 'results' | 'active' | 'feedback' | 'saved'
type DemoStage = 'scenario' | 'first-pass' | 'reveal' | 'remembered'
type WeatherPoint = { time: string; temperature: number; uvIndex: number }
type WeatherState = { temperature: number; uvIndex: number; source: string; forecast: WeatherPoint[] }

const PATHS = { landing: '/', product: '/app' }
const go = (path: string) => { window.location.href = path }

function browserProfileId() {
  const key = 'cremorne-memory-profile-id'
  const existing = window.localStorage.getItem(key)
  if (existing) return existing
  const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `worker-${Date.now()}`
  window.localStorage.setItem(key, id)
  return id
}

function withSpaceDuration(brief: string, durationMinutes: number) {
  const withoutDuration = brief
    .replace(/\s*(?:for\s+)?\d+(?:\.\d+)?\s*(?:minutes?|mins?|hours?|hrs?)\.?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
  return `${withoutDuration}. For ${durationMinutes} minutes.`
}

function bookingEnd(start: string, durationMinutes: number) {
  const [hour, minute] = start.split(':').map(Number)
  const total = Math.min(1439, hour * 60 + minute + durationMinutes)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function structuredDemandChips(decision: RecommendResponse | null) {
  if (!decision) return []
  const demand = decision.demand
  if (demand.intent === 'movement') {
    const chips = [decision.resolvedDestination?.name || demand.destinationText || 'Destination']
    if (demand.arrivalDeadline) chips.push(`By ${demand.arrivalDeadline}`)
    if (demand.requirements.lowUv) chips.push(`Low UV · ${demand.requirementStrength}`)
    if (demand.requirements.stepFree) chips.push(`Step-free · ${demand.requirementStrength}`)
    if (demand.preferences.crowding === 'lower') chips.push('Lower crowding')
    if (demand.departureFlexibilityMinutes) chips.push(`Flexible ${demand.departureFlexibilityMinutes} min`)
    return chips
  }
  const chips = [`${demand.capacityRequired} people`, `${demand.startTime || '14:00'} · ${demand.durationMinutes} min`]
  if (demand.requirements.hybridEquipment) chips.push('Hybrid equipped')
  if (demand.requirements.accessible) chips.push('Accessible')
  return [...chips, ...demand.requirements.equipment]
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <a className="brand" href={PATHS.landing} aria-label="Cremorne Memory home">
      <span className="brand__mark"><span /><span /><span /></span>
      {!compact && <span>Cremorne <strong>Memory</strong></span>}
    </a>
  )
}

function Landing() {
  return (
    <main className="landing landing-home">
      <header className="landing-nav wrap">
        <Brand />
        <nav className="landing-nav__links" aria-label="Landing navigation">
            <button className="button button--ink" onClick={() => go(PATHS.product)}>Try live proof <ArrowRight size={17} /></button>
        </nav>
      </header>

      <section className="hero hero--product wrap">
        <div className="hero__copy">
          <p className="eyebrow"><span className="live-dot" /> CREMORNE MEMORY</p>
          <h1>Use the capacity <em>Cremorne already has.</em></h1>
          <p className="hero__lead">Turn fragmented signals into guided route × time and room × time actions—then improve the next action with measured outcomes.</p>
          <div className="hero__actions">
            <button className="button button--accent button--large" onClick={() => go(PATHS.product)}>Try live proof <ArrowRight size={19} /></button>
            <span className="no-login"><Check size={16}/> No login · starts immediately</span>
          </div>
          <div className="persona-hero"><div>M</div><span><q>A route is only usable for me when I can arrive on time without prolonged direct sun.</q><small>Mia · Cremorne worker with albinism and photosensitivity</small></span></div>
        </div>

        <div className="hero__visual" aria-label="Cremorne with overloaded and spare capacity">
          <img src="/illustrations/cremorne-hero-unified.png" alt="A crowded exposed street beside a shaded passage and an underused meeting room" />
          <div className="hero-note hero-note--crowd">Overloaded now</div>
          <div className="hero-note hero-note--route">Underused capacity</div>
          <div className="hero-note hero-note--room">Usable for Mia</div>
        </div>
      </section>

      <section className="value-triad wrap" aria-label="How Cremorne Memory creates value">
        <article><span><Activity/></span><div><strong>Fragmented signals</strong><p>Weather · demand · owner rules</p></div></article>
        <article><span><CircleGauge/></span><div><strong>Guided action</strong><p>Capacity Graph · route / room × time</p></div></article>
        <article><span><BrainCircuit/></span><div><strong>Memory</strong><p>Outcome → next eligible set</p></div></article>
      </section>

      <section className="landing-proof">
        <div className="wrap landing-proof__inner">
          <div><span>THE DIFFERENCE</span><strong>Prediction sees what may happen.<br/>Memory improves what happens next.</strong></div>
          <button className="button button--accent button--large" onClick={() => go(PATHS.product)}>Try live proof <ArrowRight size={19}/></button>
        </div>
      </section>
    </main>
  )
}

function useWeather() {
  const [weather, setWeather] = useState<WeatherState>({ temperature: 0, uvIndex: 0, source: 'Live feed unavailable', forecast: [] })
  useEffect(() => {
    const controller = new AbortController()
    fetch('https://api.open-meteo.com/v1/forecast?latitude=-37.83&longitude=144.995&hourly=temperature_2m,uv_index&forecast_days=2&timezone=Australia%2FSydney', { signal: controller.signal })
      .then((response) => response.json()).then((data) => {
        const now = new Date()
        const localHour = `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:00`
        const index = data.hourly?.time?.findIndex((value: string) => value === localHour) ?? -1
        const forecast = (data.hourly?.time ?? []).map((time: string, pointIndex: number) => ({
          time,
          temperature: Number(data.hourly.temperature_2m[pointIndex]),
          uvIndex: Number(data.hourly.uv_index[pointIndex]),
        }))
        if (index >= 0) setWeather({ temperature: forecast[index].temperature, uvIndex: forecast[index].uvIndex, source: 'Cremorne hourly forecast · Open-Meteo', forecast })
      }).catch(() => undefined)
    return () => controller.abort()
  }, [])
  return weather
}

function weatherAtClock(weather: WeatherState, clock: string) {
  if (!weather.forecast.length) return { temperature: weather.temperature, uvIndex: weather.uvIndex, time: clock }
  const [hour] = clock.split(':').map(Number)
  const now = new Date()
  const target = new Date(now)
  target.setHours(hour, 0, 0, 0)
  if (target.getTime() < now.getTime()) target.setDate(target.getDate() + 1)
  const key = `${String(target.getFullYear()).padStart(4, '0')}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00`
  return weather.forecast.find((point) => point.time === key) ?? { temperature: weather.temperature, uvIndex: weather.uvIndex, time: clock }
}

function ProductApp() {
  const [role, setRole] = useState<ProductRole>('demo')
  const [task, setTask] = useState<WorkerTask>('route')
  const [workerMode, setWorkerMode] = useState<WorkerMode>('explore')
  const [memory, setMemory] = useState<MemoryRule[]>(() => loadMemory())
  const weather = useWeather()
  return (
    <div className="product-clear">
      <header className="product-clear__header">
        <Brand />
        <div className="role-switch" role="group" aria-label="Choose product role">
          <button className={role === 'demo' ? 'is-active' : ''} onClick={() => setRole('demo')}><Sparkles size={16} /> Live proof</button>
          <button className={role === 'worker' ? 'is-active' : ''} onClick={() => { setWorkerMode('explore'); setRole('worker') }}><Users size={16} /> Worker app</button>
          <button className={role === 'operator' ? 'is-active' : ''} onClick={() => setRole('operator')}><FlaskConical size={16} /> CDH lab</button>
        </div>
        <div className="product-status"><a href={PATHS.landing}><Home size={17} /><span>Home</span></a></div>
      </header>
      {role === 'demo' && <GuidedDemo onOpenWorker={() => { setWorkerMode('mia'); setRole('worker'); setTask('route') }} />}
      {role === 'worker' && <WorkerExperience task={task} setTask={setTask} weather={weather} memory={memory} workerMode={workerMode} />}
      {role === 'operator' && <OperatorExperience weather={weather} memory={memory} setMemory={setMemory} onSeeWorker={() => { setWorkerMode('mia'); setRole('worker'); setTask('route') }} />}
    </div>
  )
}

function GuidedDemo({ onOpenWorker }: {
  onOpenWorker: () => void
}) {
  const [stage, setStage] = useState<DemoStage>('scenario')
  const hotspot = productContext.hotspots[0]
  const direct = productContext.routeSets['east-richmond'][0]
  const canopy = productContext.routeSets['east-richmond'][2]
  const extraSeconds = Math.round((canopy.durationMin - direct.durationMin) * 60)
  const canopyGain = canopy.canopyAdjacentPct - direct.canopyAdjacentPct
  const progress = stage === 'scenario' ? 0 : stage === 'first-pass' ? 1 : stage === 'reveal' ? 2 : 3

  return (
    <main className={`guided-demo demo-${stage}`}>
      <header className="demo-heading">
        <div><span>30-SECOND LIVE PROOF</span><h1>One real hotspot. Three routes. One learning loop.</h1></div>
        <div className="demo-context"><span><Activity/>Yarra count</span><span><Trees/>Vicmap canopy</span><span><Navigation/>Valhalla routes</span></div>
      </header>

      <section className="demo-workbench">
        <div className="demo-visual">
          <div className="mia-chip"><div>M</div><span><small>MIA · WORKER WITH ALBINISM</small><strong>Low UV required · arrive by 4:20</strong></span></div>
          <svg viewBox="0 0 760 430" role="img" aria-label="Three route options changing across the Memory demonstration">
            <g className="demo-buildings"><rect x="155" y="272" width="112" height="84"/><rect x="335" y="185" width="116" height="86"/><rect x="530" y="87" width="105" height="82"/></g>
            <path className="demo-route route-a" d="M68 372 C190 312 272 270 365 236 S555 162 690 62"/>
            <path className="demo-route route-b" d="M68 372 C185 184 315 106 470 128 S610 108 690 62"/>
            <path className="demo-route route-c" d="M68 372 C205 388 326 350 451 289 S592 176 690 62"/>
            {(stage === 'first-pass' || stage === 'reveal') && <circle className="demo-traveller traveller-b" r="8"><animateMotion dur="2.4s" repeatCount="indefinite" path="M68 372 C185 184 315 106 470 128 S610 108 690 62" /></circle>}
            {stage === 'remembered' && <circle className="demo-traveller traveller-c" r="8"><animateMotion dur="2.8s" repeatCount="indefinite" path="M68 372 C205 388 326 350 451 289 S592 176 690 62" /></circle>}
            <g className="demo-crowd">{Array.from({ length: 24 }).map((_, index) => <circle key={index} cx={88 + index * 21} cy={356 - index * 7 + (index % 3) * 9} r="5"/>)}</g>
            <circle className="demo-origin" cx="68" cy="372" r="14"/><circle className="demo-target" cx="690" cy="62" r="14"/>
          </svg>
          <div className="route-tag route-tag-a"><i/>Route A <b>9.2 min · 6% canopy</b></div>
          <div className="route-tag route-tag-b"><i/>Route B <b>{direct.durationMin} min · {direct.canopyAdjacentPct}% canopy</b></div>
          <div className="route-tag route-tag-c"><i/>Canopy C <b>{canopy.durationMin} min · {canopy.canopyAdjacentPct}% canopy</b></div>
          {stage === 'remembered' && <div className="memory-retrieved"><BrainCircuit/><span>LEARNING LOOP<strong>Outcome + need + context</strong></span></div>}
        </div>

        <aside className="demo-story" aria-live="polite">
          {stage === 'scenario' && <div className="demo-story__stage" key="scenario">
            <span className="step-kicker">1 · DOCUMENTED HOTSPOT</span>
            <h2>{hotspot.name}</h2>
            <p>Yarra recorded the precinct’s highest pedestrian volumes at this gateway.</p>
            <div className="demo-question"><span>AM + PM PEAK · 2 HOURS</span><strong>{hotspot.surveyedPedestrianMovements.toLocaleString()} movements</strong><ArrowRight/></div>
            <button className="primary-action" onClick={() => setStage('first-pass')}>Compare real routes <Play size={18}/></button>
          </div>}
          {stage === 'first-pass' && <div className="demo-story__stage" key="first-pass">
            <span className="step-kicker">2 · FASTEST FIRST</span>
            <h2>Route B wins on travel time.</h2>
            <div className="result-pair"><div><span>ROUTE B</span><strong>{direct.durationMin} min</strong><small>{direct.canopyAdjacentPct}% canopy-adjacent</small></div><div><span>ROUTE C</span><strong>{canopy.durationMin} min</strong><small>{canopy.canopyAdjacentPct}% canopy-adjacent</small></div></div>
            <div className="apparent-winner"><Check/><span><small>FASTEST PUBLIC ROUTE</small><strong>Route B · Direct</strong></span></div>
            <button className="primary-action" onClick={() => setStage('reveal')}>Now add Mia’s need <ArrowRight size={18}/></button>
          </div>}
          {stage === 'reveal' && <div className="demo-story__stage" key="reveal">
            <span className="step-kicker coral">3 · USABLE FOR WHOM?</span>
            <h2>For Mia, 36 seconds changes the trade-off.</h2>
            <div className="demo-exceptions"><div><Clock3/><span>EXTRA WALK<strong>+{extraSeconds} sec</strong></span></div><div><Trees/><span>CANOPY ADJACENCY<strong>+{canopyGain} points</strong></span></div></div>
            <p className="demo-insight">The field pilot measures direct-sun minutes, crossing wait and the worker outcome.</p>
            <button className="primary-action" onClick={() => setStage('remembered')}>See the learning loop <BrainCircuit size={18}/></button>
          </div>}
          {stage === 'remembered' && <div className="demo-story__stage" key="remembered">
            <span className="step-kicker">4 · USE, MEASURE, IMPROVE</span>
            <h2>The next match starts with what happened.</h2>
            <div className="remembered-choice blocked"><Activity/><span><small>WORKER OUTCOME</small><strong>Time · direct sun · crossing wait · experience</strong></span></div>
            <div className="remembered-choice eligible"><Check/><span><small>NEXT MATCH</small><strong>The same need does not start from zero</strong></span></div>
            <div className="remembered-rule"><span>WORKER CHOOSES</span><strong>the outcome is measured</strong><span>CREMORNE LEARNS</span><strong>the next match improves</strong></div>
            <button className="primary-action" onClick={onOpenWorker}>Continue as Mia <ArrowRight size={18}/></button>
            <button className="secondary-action" onClick={() => setStage('scenario')}>Replay the proof</button>
          </div>}
        </aside>
      </section>

      <footer className="demo-footer">
        <div className="demo-progress-line">{['Hotspot', 'Fastest', 'Functional need', 'Measure + learn'].map((label, index) => <span key={label} className={progress >= index ? 'is-on' : ''}><i>{progress > index ? <Check/> : index + 1}</i>{label}</span>)}</div>
        <p><strong>Real public data</strong> · Yarra pedestrian counts · Valhalla / OSM routes · Vicmap trees</p>
      </footer>
    </main>
  )
}

function WorkerExperience({ task, setTask, weather, memory, workerMode }: {
  task: WorkerTask
  setTask: (task: WorkerTask) => void
  weather: WeatherState
  memory: MemoryRule[]
  workerMode: WorkerMode
}) {
  return (
    <main className="worker-clear">
      <header className="task-switcher">
        <div role="group" aria-label="Choose worker task"><button className={task === 'route' ? 'is-active' : ''} onClick={() => setTask('route')}><MapIcon size={17} /> Plan a route</button><button className={task === 'space' ? 'is-active' : ''} onClick={() => setTask('space')}><Building2 size={17} /> Find a room</button></div>
        <div className="live-context"><b>LIVE CONTEXT</b><span><ThermometerSun size={15} />{weather.source === 'Live feed unavailable' ? '—' : `${weather.temperature.toFixed(0)}°`}</span><span><Sun size={15} />UV {weather.source === 'Live feed unavailable' ? '—' : weather.uvIndex.toFixed(1)}</span></div>
      </header>
      {task === 'route' ? <RouteJourney key={`route-${workerMode}`} weather={weather} memory={memory} workerMode={workerMode} /> : <SpaceJourney key={`space-${workerMode}`} workerMode={workerMode} />}
    </main>
  )
}

function JourneyProgress({ stage }: { stage: JourneyStage }) {
  const current = stage === 'setup' ? 0 : stage === 'results' ? 1 : 2
  return <div className="journey-progress" aria-label="Journey progress">{['Your need', 'Choose', 'Complete'].map((label, index) => <div key={label} className={current >= index ? 'is-on' : ''}><i>{current > index ? <Check size={11} /> : index + 1}</i><span>{label}</span></div>)}</div>
}

function RetryNotice({ title, message, onRetry, retrying = false }: {
  title: string
  message: string
  onRetry: () => void
  retrying?: boolean
}) {
  return <div className="honest-gap action-error" role="alert"><ShieldAlert/><div><strong>{title}</strong><span>{message}</span></div><button disabled={retrying} onClick={onRetry}><RefreshCw size={13}/>{retrying ? 'Retrying' : 'Retry'}</button></div>
}

function TracePreview({ points }: { points: JourneyPoint[] }) {
  const path = useMemo(() => {
    if (points.length < 2) return ''
    const lats = points.map((point) => point[0])
    const lngs = points.map((point) => point[1])
    const minLat = Math.min(...lats); const maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs); const maxLng = Math.max(...lngs)
    const width = Math.max(0.00001, maxLng - minLng)
    const height = Math.max(0.00001, maxLat - minLat)
    return points.map(([lat, lng], index) => {
      const x = 10 + (lng - minLng) / width * 140
      const y = 50 - (lat - minLat) / height * 40
      return `${index ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`
    }).join(' ')
  }, [points])
  if (points.length < 2) return <div className="trace-preview trace-preview--empty">No path recorded</div>
  return <svg className="trace-preview" viewBox="0 0 160 60" role="img" aria-label="The path walked on this journey"><path d={path} /><circle cx="12" cy="44" r="4"/><circle cx="148" cy="15" r="4"/></svg>
}

function RouteJourney({ weather, memory, workerMode }: { weather: WeatherState; memory: MemoryRule[]; workerMode: WorkerMode }) {
  const [stage, setStage] = useState<JourneyStage>('setup')
  const [brief, setBrief] = useState(workerMode === 'mia'
    ? 'Get me to East Richmond by 4:20pm with minimal direct sun. I can wait up to 10 minutes.'
    : 'Get me to Richmond by 5:30pm. Prefer a less crowded route. I can wait up to 15 minutes.')
  const [selectedId, setSelectedId] = useState<string>()
  const [startedAt, setStartedAt] = useState<number>()
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [personalOutcomes, setPersonalOutcomes] = useState(() => loadJourneyOutcomes())
  const [decision, setDecision] = useState<RecommendResponse | null>(null)
  const [isFinding, setIsFinding] = useState(false)
  const [clarification, setClarification] = useState<string | null>(null)
  const [routeError, setRouteError] = useState(false)
  const [journeyTrace, setJourneyTrace] = useState<JourneyPoint[]>([])
  const [feedback, setFeedback] = useState<'better' | 'same' | 'worse' | null>(null)
  const [crossingWaitMinutes, setCrossingWaitMinutes] = useState('')
  const [directSunMinutes, setDirectSunMinutes] = useState('')
  const [outcomeStatus, setOutcomeStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [shareStatus, setShareStatus] = useState<'idle' | 'sharing' | 'shared' | 'kept-private' | 'error'>('idle')
  const [shareChoice, setShareChoice] = useState(false)
  const [draftMode, setDraftMode] = useState(false)
  const [draftTrace, setDraftTrace] = useState<JourneyPoint[]>([])
  const [draftName, setDraftName] = useState('My suggested route')
  const [draftStatus, setDraftStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const watchId = useRef<number | null>(null)
  const decisionRequest = useRef<Promise<RecommendResponse> | null>(null)
  const profileId = useMemo(() => browserProfileId(), [])
  const parsedBrief = useMemo(() => parseRouteBrief(brief), [brief])
  const timeOfUseWeather = useMemo(() => weatherAtClock(weather, parsedBrief.deadlineLabel), [weather, parsedBrief.deadlineLabel])
  const decisionChips = useMemo(() => structuredDemandChips(decision), [decision])
  const workers = demandAtTime(parsedBrief.destination, parsedBrief.departure)
  const localRoutes = useMemo(() => evaluateProductRoutes({ destination: parsedBrief.destination, need: parsedBrief.need, strength: parsedBrief.strength, flexibilityMin: parsedBrief.flexibilityMin, uvIndex: timeOfUseWeather.uvIndex, workers, memoryRules: memory, personalOutcomes }), [parsedBrief, timeOfUseWeather.uvIndex, workers, memory, personalOutcomes])
  const routes = useMemo(() => {
    if (!decision?.options.length) return localRoutes
    return localRoutes.map((route) => {
      const option = decision.options.find((candidate) => candidate.productId === route.id)
      if (!option) return route
      return {
        ...route,
        name: option.name,
        eligible: option.eligible,
        recommended: option.recommended,
        score: option.score,
        reasons: option.reasons,
        durationMin: option.durationMinutes ?? route.durationMin,
        suggestedDelayMin: option.suggestedDelayMinutes ?? route.suggestedDelayMin,
        predictedLoad: option.predictedDemand ?? route.predictedLoad,
        remainingCapacity: option.remainingCapacity,
        capacity: option.safeCapacity,
        capacityEvidence: option.capacityEvidence ?? route.capacityEvidence,
        exposureIndex: option.exposureIndex ?? route.exposureIndex,
      } satisfies EvaluatedProductRoute
    }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || Number(b.recommended) - Number(a.recommended) || a.score - b.score)
  }, [decision, localRoutes])
  const selected = routes.find((route) => route.id === selectedId && route.eligible) ?? routes.find((route) => route.eligible) ?? routes[0]
  const noEligible = routes.every((route) => !route.eligible)
  const journeyProgress = Math.min(96, Math.max(4, selected ? elapsedSeconds / (selected.durationMin * 60) * 100 : 4))
  const routeReason = (route: EvaluatedProductRoute) => {
    if (!route.eligible) return route.reasons[0] || 'This route does not meet a required need.'
    const personal = route.reasons.find((reason) => /previously felt|comparable user/i.test(reason))
    if (personal) return personal.replace(/^Personal Memory:\s*/i, '')
    if (parsedBrief.need === 'lower-uv') return `${route.canopyAdjacentPct}% canopy-adjacent · arrives by ${parsedBrief.deadlineLabel}`
    if (parsedBrief.need === 'lower-crowding') return `${route.durationMin} min · lower-demand option at this time`
    return `${route.durationMin} min · fastest fit for your arrival time`
  }

  useEffect(() => {
    if (stage !== 'active' || !startedAt) return
    const timer = window.setInterval(() => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000))), 1000)
    return () => window.clearInterval(timer)
  }, [stage, startedAt])

  useEffect(() => () => {
    if (watchId.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current)
  }, [])

  const resetForInput = () => { setStage('setup'); setSelectedId(undefined); setStartedAt(undefined); setElapsedSeconds(0); setDecision(null); decisionRequest.current = null; setClarification(null); setRouteError(false); setJourneyTrace([]); setFeedback(null); setCrossingWaitMinutes(''); setDirectSunMinutes(''); setOutcomeStatus('idle'); setShareStatus('idle'); setDraftMode(false); setDraftTrace([]); setDraftStatus('idle') }
  const findRoutes = async () => {
    setIsFinding(true); setClarification(null); setRouteError(false)
    const instant = localRoutes.find((route) => route.eligible)
    setSelectedId(instant?.id)
    setStage('results')
    try {
      const pending = recommendCapacity({
        brief,
        context: currentDecisionContext({ uvIndex: timeOfUseWeather.uvIndex, temperature: timeOfUseWeather.temperature, crowding: 0, workers, profileId }),
        useMemory: true,
      })
      decisionRequest.current = pending
      const response = await pending
      setDecision(response)
      if (response.clarification) { setClarification(response.clarification); return }
      const preferred = response.recommendation?.productId ?? response.options.find((option) => option.eligible)?.productId
      setSelectedId((current) => current && current !== instant?.id ? current : preferred)
    } catch {
      setDecision(null)
      setRouteError(true)
    } finally {
      setIsFinding(false)
    }
  }
  const startJourney = () => {
    setStartedAt(Date.now()); setElapsedSeconds(0); setJourneyTrace([]); setStage('active')
    if (navigator.geolocation) {
      watchId.current = navigator.geolocation.watchPosition(({ coords }) => {
        const point: JourneyPoint = [coords.latitude, coords.longitude]
        setJourneyTrace((current) => {
          if (current.length && distanceMetres(current.at(-1)!, point) < 4) return current
          return [...current, point].slice(-250)
        })
      }, () => undefined, { enableHighAccuracy: true, maximumAge: 5_000, timeout: 12_000 })
    }
  }
  const finishJourney = () => {
    if (watchId.current != null && navigator.geolocation) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null }
    if (startedAt) setElapsedSeconds(Math.max(1, Math.floor((Date.now() - startedAt) / 1000)))
    setStage('feedback')
  }
  const persistOutcome = async (value: 'better' | 'same' | 'worse', shareTrace: boolean) => {
    const matchedDecision = decision ?? await decisionRequest.current
    if (!matchedDecision) throw new Error('The journey match is still loading.')
    const graphOption = matchedDecision.options.find((option) => option.productId === selected.id)
    if (!graphOption) throw new Error('The selected route could not be matched.')
    const crossingWait = Number(crossingWaitMinutes)
    const directSun = Number(directSunMinutes)
    return recordGraphOutcome({
      decisionId: matchedDecision.decisionId,
      capacityUnitId: graphOption.id,
      demand: matchedDecision.demand,
      context: currentDecisionContext({ uvIndex: timeOfUseWeather.uvIndex, temperature: timeOfUseWeather.temperature, crowding: 0, workers, profileId }),
      feedback: value,
      metrics: {
        elapsedSeconds,
        predictedMinutes: selected.durationMin,
        exposureIndex: selected.exposureIndex,
        ...(Number.isFinite(crossingWait) && crossingWaitMinutes !== '' ? { crossingWaitMinutes: crossingWait } : {}),
        ...(Number.isFinite(directSun) && directSunMinutes !== '' ? { directSunMinutes: directSun } : {}),
      },
      journeyTrace: shareTrace ? journeyTrace : undefined,
      shareTrace,
      candidateRouteName: `Worker-discovered path to ${matchedDecision.resolvedDestination?.name ?? parsedBrief.destination}`,
    })
  }
  const syncOutcome = async (value: 'better' | 'same' | 'worse') => {
    setOutcomeStatus('saving')
    try { await persistOutcome(value, false); setOutcomeStatus('saved') }
    catch { setOutcomeStatus('error') }
  }
  const recordFeedback = async (value: 'better' | 'same' | 'worse') => {
    setFeedback(value)
    const crossingWait = Number(crossingWaitMinutes)
    const directSun = Number(directSunMinutes)
    setPersonalOutcomes(saveJourneyOutcome({
      routeId: selected.id,
      routeName: selected.name,
      completedAt: new Date().toISOString(),
      elapsedSeconds,
      predictedMinutes: selected.durationMin,
      exposureIndex: selected.exposureIndex,
      ...(Number.isFinite(crossingWait) && crossingWaitMinutes !== '' ? { crossingWaitMinutes: crossingWait } : {}),
      ...(Number.isFinite(directSun) && directSunMinutes !== '' ? { directSunMinutes: directSun } : {}),
      feedback: value,
    }))
    setStage('saved')
    const canShareNewPath = value === 'better' && isDistinctJourneyTrace(journeyTrace, selected.coordinates)
    if (!canShareNewPath) await syncOutcome(value)
  }
  const canShareNewPath = feedback === 'better' && isDistinctJourneyTrace(journeyTrace, selected.coordinates)
  const chooseTraceSharing = async (shareTrace: boolean) => {
    if (!feedback) return
    setShareChoice(shareTrace)
    setShareStatus(shareTrace ? 'sharing' : 'kept-private')
    try {
      const response = await persistOutcome(feedback, shareTrace)
      setShareStatus(shareTrace && response?.candidateCapacityId ? 'shared' : 'kept-private')
    } catch {
      setShareStatus('error')
    }
  }
  const submitDraftRoute = async () => {
    if (draftTrace.length < 3 || !decision) { setDraftStatus('error'); return }
    const source = decision.options.find((option) => option.productId === selected.id) ?? decision.options.find((option) => option.kind === 'movement')
    if (!source) { setDraftStatus('error'); return }
    const distance = draftTrace.slice(1).reduce((total, point, index) => total + distanceMetres(draftTrace[index], point), 0)
    setDraftStatus('saving')
    try {
      const response = await recordGraphOutcome({
        decisionId: decision.decisionId,
        capacityUnitId: source.id,
        demand: decision.demand,
        context: currentDecisionContext({ uvIndex: timeOfUseWeather.uvIndex, temperature: timeOfUseWeather.temperature, crowding: 0, workers, profileId }),
        metrics: { drawnPointCount: draftTrace.length, estimatedDistanceMetres: Math.round(distance) },
        journeyTrace: draftTrace,
        shareTrace: true,
        candidateRouteName: draftName.trim() || 'Worker-proposed route',
      })
      setDraftStatus(response.candidateCapacityId ? 'saved' : 'error')
    } catch { setDraftStatus('error') }
  }

  return (
    <section className="route-experience">
      <aside className="journey-panel">
        <JourneyProgress stage={stage} />
        {stage === 'setup' && <div className="journey-step">
          {workerMode === 'mia' && <span className="step-kicker">MIA · ALBINISM + PHOTOSENSITIVITY</span>}<h1>What journey do you need?</h1><p>{workerMode === 'mia' ? 'Travel time, canopy evidence and her low-UV requirement shape Mia’s options.' : 'Describe it in your own words.'}</p>
          <label className="brief-composer"><span>JOURNEY BRIEF</span><textarea value={brief} onChange={(event) => { setBrief(event.target.value); resetForInput() }} rows={4}/></label>
          {clarification && <div className="honest-gap"><ShieldAlert/><div><strong>Which destination?</strong><span>{clarification}</span></div></div>}
          <button className="primary-action" disabled={isFinding} onClick={findRoutes}>{isFinding ? 'Understanding your journey…' : 'Find guided actions'} <ArrowRight size={18} /></button>
        </div>}

        {stage === 'results' && <div className="journey-step">
          <button className="back-action" onClick={() => setStage('setup')}><ArrowLeft size={15} /> Change brief</button><h1>{noEligible ? 'No route fits every need yet.' : 'Choose your route.'}</h1><p>{noEligible ? 'Try changing one requirement or departure time.' : `${routes.filter((route) => route.eligible).length} routes fit your brief`}</p>
          <div className="brief-understood brief-understood--result"><span>YOUR NEED {isFinding && <Activity size={12}/>}</span><div>{(decisionChips.length ? decisionChips : parsedBrief.chips).map((chip) => <b key={chip}>{chip}</b>)}</div></div>
          {routeError && <RetryNotice title="Could not refresh this match" message="Your route choices are still available. Retry when you are ready." onRetry={() => void findRoutes()} retrying={isFinding}/>}
          {noEligible ? <div className="honest-gap"><ShieldAlert /><div><strong>No eligible route</strong><span>{routes[0]?.reasons[0]}</span></div></div> : <div className="choice-list">{routes.map((route) => <button key={route.id} disabled={!route.eligible} onClick={() => setSelectedId(route.id)} className={`${selected.id === route.id ? 'is-selected' : ''} ${!route.eligible ? 'is-blocked' : ''}`}><i /><div><span>{route.recommended ? 'BEST FIT' : route.eligible ? 'ALTERNATIVE' : 'NOT ELIGIBLE'}</span><strong>{route.name}</strong><small>{route.eligible ? `${route.durationMin} min walk · ${route.canopyAdjacentPct}% canopy-adjacent` : routeReason(route)}</small>{selected.id === route.id && route.eligible && <small className="route-why-inline"><Check size={11}/>{routeReason(route)}</small>}</div>{selected.id === route.id && <Check size={17} />}</button> )}</div>}
          {!noEligible && <div className="journey-actions"><button className="primary-action" onClick={startJourney}>Start guidance <Navigation size={18} /></button><button className="secondary-action route-discovery-action" onClick={() => { setDraftMode(true); setDraftStatus('idle') }}><PencilLine size={16}/><span><strong>Draw a route</strong><small>Share local knowledge</small></span></button></div>}
        </div>}

        {stage === 'active' && <div className="journey-step active-journey">
          <span className="step-kicker live"><i /> LIVE GUIDANCE</span><h1>{selected.name}</h1><div className="journey-live-progress"><div><strong>On track</strong></div><div className="journey-live-progress__track" role="progressbar" aria-label="Estimated journey progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(journeyProgress)}><i style={{ width: `${journeyProgress}%` }} /></div></div><div className="live-expectation"><Clock3/><span><small>EXPECTED</small><strong>{selected.durationMin} min · arrival by {parsedBrief.deadlineLabel}</strong></span></div><div className="next-turn"><Navigation /><div><span>NEXT</span><strong>Follow the highlighted pedestrian route</strong><small>Route progress follows your current location</small></div></div><button className="primary-action" onClick={finishJourney}>I’ve arrived <Check size={18} /></button>
        </div>}

        {stage === 'feedback' && <div className="journey-step arrival-card">
          <div className="arrival-icon"><Check /></div><span className="step-kicker">ARRIVED</span><h1>What happened on this journey?</h1><div className="captured-path"><TracePreview points={journeyTrace}/><span><small>YOUR ROUTE</small><strong>{journeyTrace.length > 1 ? 'Path recorded' : 'No path recorded'}</strong></span></div><div className="arrival-metrics"><div><strong>{Math.max(1, Math.round(elapsedSeconds / 60))}</strong><span>minutes observed</span></div><div><strong>{selected.durationMin}</strong><span>minutes expected</span></div><div><strong>{selected.canopyAdjacentPct}%</strong><span>canopy-adjacent</span></div></div><div className="journey-observations"><label><span>CROSSING WAIT</span><div><input aria-label="Crossing wait in minutes" inputMode="decimal" type="number" min="0" step="0.5" value={crossingWaitMinutes} onChange={(event) => setCrossingWaitMinutes(event.target.value)} placeholder="—"/><b>min</b></div></label><label><span>DIRECT SUN</span><div><input aria-label="Direct sun in minutes" inputMode="decimal" type="number" min="0" step="0.5" value={directSunMinutes} onChange={(event) => setDirectSunMinutes(event.target.value)} placeholder="—"/><b>min</b></div></label></div><strong className="feedback-question">Compared with what you expected?</strong><div className="feedback-row">{(['better', 'same', 'worse'] as const).map((value) => <button key={value} onClick={() => void recordFeedback(value)}>{value === 'better' ? 'Better' : value === 'same' ? 'Same' : 'Worse'}</button>)}</div>
        </div>}

        {stage === 'saved' && <div className="journey-step saved-card">
          <div className="arrival-icon"><BrainCircuit /></div><span className="step-kicker">PERSONAL MEMORY UPDATED</span><h1>{canShareNewPath ? 'You found another way.' : 'Your next journey starts smarter.'}</h1><div className="feedback-saved"><Check/><span>{canShareNewPath ? 'This path differs from the routes Cremorne currently knows.' : 'This outcome can shape your next similar journey.'}</span></div>
          {canShareNewPath && shareStatus === 'idle' && <div className="share-path-card"><TracePreview points={journeyTrace}/><div><strong>Share this path with Cremorne?</strong><span>It becomes a candidate path for CDH to validate.</span></div><button className="primary-action" onClick={() => void chooseTraceSharing(true)}>Share path <ArrowRight size={17}/></button><button className="secondary-action" onClick={() => void chooseTraceSharing(false)}>Keep private</button></div>}
          {shareStatus === 'sharing' && <div className="feedback-saved"><Activity/><span>Sharing the path…</span></div>}
          {shareStatus === 'shared' && <div className="candidate-saved"><Check/><span><strong>Candidate path added</strong><small>It is ready for CDH to review.</small></span></div>}
          {shareStatus === 'kept-private' && canShareNewPath && <div className="feedback-saved"><Check/><span>Only your personal outcome was retained.</span></div>}
          {!canShareNewPath && outcomeStatus === 'saving' && <div className="feedback-saved"><Activity/><span>Syncing this outcome with Memory…</span></div>}
          {!canShareNewPath && outcomeStatus === 'error' && feedback && <RetryNotice title="Memory sync failed" message="The outcome remains on this device. Retry when the connection is available." onRetry={() => void syncOutcome(feedback)}/>}
          {shareStatus === 'error' && <RetryNotice title={shareChoice ? 'Path not shared yet' : 'Private outcome not synced'} message="Your personal outcome remains on this device." onRetry={() => void chooseTraceSharing(shareChoice)}/>}
          {(!canShareNewPath || shareStatus !== 'idle') && shareStatus !== 'sharing' && <button className="primary-action" onClick={resetForInput}>Plan another journey <ArrowRight size={18} /></button>}
        </div>}
      </aside>

      <div className="journey-map">
        <CremorneMap routes={routes} selectedId={selected?.id} onSelect={(id) => { if (!draftMode) { setSelectedId(id); if (stage === 'setup') setStage('results') } }} showTrees journeyProgress={stage === 'active' ? journeyProgress / 100 : undefined} journeyTrace={journeyTrace} draftMode={draftMode} draftTrace={draftTrace} onDraftPoint={(point) => { setDraftTrace((current) => [...current, point]); setDraftStatus('idle') }} />
        <div className="map-context"><span><Sun size={15}/>UV {timeOfUseWeather.uvIndex.toFixed(1)} at arrival</span><span><Trees size={15} /> Canopy along each route</span><span><Users size={15} /> {workers.toLocaleString()} arrivals in this time band</span>{(memory.length > 0 || personalOutcomes.length > 0) && <span className="memory-on"><BrainCircuit size={15} /> Previous outcome applied</span>}</div>
        {stage === 'active' && <div className="map-active-banner"><Navigation size={16} /><span>Journey in progress</span></div>}
        {draftMode && <div className="route-sketch-card">
          <button className="route-sketch-close" aria-label="Close route designer" onClick={() => { setDraftMode(false); setDraftTrace([]); setDraftStatus('idle') }}><X size={16}/></button>
          <span className="step-kicker">SUGGEST A ROUTE</span><strong>Tap the map to draw a path.</strong><small>{draftTrace.length < 3 ? `${3 - draftTrace.length} more point${3 - draftTrace.length === 1 ? '' : 's'} needed` : `${draftTrace.length} points · ready to submit`}</small>
          <input aria-label="Candidate route name" value={draftName} onChange={(event) => setDraftName(event.target.value)} />
          <div><button disabled={!draftTrace.length} onClick={() => { setDraftTrace((current) => current.slice(0, -1)); setDraftStatus('idle') }}><RotateCcw size={14}/> Undo</button><button disabled={draftTrace.length < 3 || draftStatus === 'saving' || !decision} onClick={() => void submitDraftRoute()}>{draftStatus === 'saving' ? 'Submitting…' : 'Submit for review'} <ArrowRight size={14}/></button></div>
          {!decision && <small className="route-sketch-sync">Preparing this journey…</small>}
          {draftStatus === 'saved' && <p><Check size={15}/><span><b>Candidate route added.</b> CDH will validate it before wider guidance.</span></p>}
          {draftStatus === 'error' && <p className="is-error"><ShieldAlert size={15}/><span>Keep the path open and try once more.</span></p>}
        </div>}
      </div>
    </section>
  )
}

function SpaceJourney({ workerMode }: { workerMode: WorkerMode }) {
  const initialBrief = workerMode === 'mia'
    ? 'Find a 6-person hybrid room at 2pm for 45 minutes with adjustable blinds.'
    : 'Find a 6-person hybrid room at 2pm.'
  const [brief, setBrief] = useState(initialBrief)
  const [appliedBrief, setAppliedBrief] = useState(initialBrief)
  const [hasSearched, setHasSearched] = useState(false)
  const [selectedId, setSelectedId] = useState('boardroom')
  const [bookingStage, setBookingStage] = useState<'available' | 'booked'>('available')
  const [decision, setDecision] = useState<RecommendResponse | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [roomIssue, setRoomIssue] = useState<WorkspaceIssueKey>('temperature')
  const [issueDetail, setIssueDetail] = useState('')
  const [feedbackStatus, setFeedbackStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [showRoomFeedback, setShowRoomFeedback] = useState(false)
  const [roomExperiences, setRoomExperiences] = useState<RoomExperience[]>(() => loadRoomExperiences())
  const [workspaceEvidence, setWorkspaceEvidence] = useState<WorkspaceIssueRecord[]>([])
  const profileId = useMemo(() => browserProfileId(), [])
  const parsedDraft = useMemo(() => parseSpaceBrief(brief), [brief])
  const parsedBrief = useMemo(() => parseSpaceBrief(appliedBrief), [appliedBrief])
  const decisionChips = useMemo(() => structuredDemandChips(decision), [decision])
  const results = useMemo(() => {
    const local = findSpaces({ people: parsedBrief.people, durationMinutes: parsedBrief.durationMinutes, requireHybrid: parsedBrief.requireHybrid, requireAccessible: parsedBrief.requireAccessible, requiredEquipment: parsedBrief.requiredEquipment, timeLabel: parsedBrief.timeLabel, scope: 'shared' })
      .map((space) => ({ ...space, rankingScore: space.capacity, recommended: false }))
    if (!decision?.options.length) return local
    return local.flatMap((space) => {
      const option = decision.options.find((candidate) => candidate.productId === space.id)
      // Keep public capability records visible if a provider returns only a
      // partial option set. This also prevents a transient API mismatch from
      // leaving the room detail pane without a selected room.
      if (!option) return [space]
      return [{ ...space, eligible: option.eligible, blockers: option.eligible ? [] : option.reasons, rankingScore: option.score, recommended: option.recommended }]
    }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || Number(b.recommended) - Number(a.recommended) || a.rankingScore - b.rankingScore || a.capacity - b.capacity)
  }, [decision, parsedBrief])
  const capabilityMatches = results.filter((space) => space.blockers.every((blocker) => /availab|owner/i.test(blocker)))
  const eligibleSpaces = results.filter((space) => space.eligible)
  const selected = results.find((space) => space.id === selectedId) ?? capabilityMatches[0] ?? eligibleSpaces[0] ?? results[0]
  const selectedOption = decision?.options.find((option) => option.productId === selected?.id)
  const selectedExperience = selected ? roomExperiences.find((experience) => experience.roomId === selected.id) : undefined
  const selectedEvidence = selected ? workspaceEvidence.filter((issue) => issue.capacityUnitId === `workspace-${selected.id}`) : []
  const previousOpenIssue = selectedExperience?.status === 'reported' ? selectedExperience : undefined
  const seatsLeft = (space: typeof results[number]) => {
    const option = decision?.options.find((candidate) => candidate.productId === space.id)
    return Math.max(0, option?.remainingCapacity ?? space.capacity - parsedBrief.people)
  }
  const chooseSpace = (id: string) => { setSelectedId(id); setBookingStage('available'); setFeedbackStatus('idle'); setShowRoomFeedback(false) }

  useEffect(() => {
    let active = true
    getWorkspaceIssues().then((response) => { if (active) setWorkspaceEvidence(response.issues) }).catch(() => undefined)
    return () => { active = false }
  }, [])

  const searchSpaces = async () => {
    const localBrief = parseSpaceBrief(brief)
    const localMatches = findSpaces({ people: localBrief.people, durationMinutes: localBrief.durationMinutes, requireHybrid: localBrief.requireHybrid, requireAccessible: localBrief.requireAccessible, requiredEquipment: localBrief.requiredEquipment, timeLabel: localBrief.timeLabel, scope: 'shared' })
    setAppliedBrief(brief); setHasSearched(true); setBookingStage('available'); setDecision(null); setIsSearching(true); setSearchError(false)
    const instantId = (localMatches.find((space) => space.eligible) ?? localMatches.find((space) => space.blockers.every((blocker) => /availab|owner/i.test(blocker))) ?? localMatches[0])?.id ?? 'boardroom'
    setSelectedId(instantId)
    try {
      const response = await recommendCapacity({
        brief,
        context: currentDecisionContext({ uvIndex: 0, temperature: 0, crowding: 0, workers: 0, profileId }),
        useMemory: true,
      })
      setDecision(response)
      const preferred = response.recommendation?.productId ?? response.options.find((option) => option.productId === 'boardroom')?.productId ?? response.options[0]?.productId ?? 'boardroom'
      setSelectedId((current) => current && current !== instantId ? current : preferred)
    } catch { setDecision(null); setSearchError(true) }
    finally { setIsSearching(false) }
  }
  const submitRoomFeedback = async () => {
    if (!selected) { setFeedbackStatus('error'); return }
    const option = decision?.options.find((candidate) => candidate.productId === selected.id)
    if (!decision || !option) { setFeedbackStatus('error'); return }
    setFeedbackStatus('saving')
    try {
      await recordGraphOutcome({
        decisionId: decision.decisionId,
        capacityUnitId: option.id,
        demand: decision.demand,
        context: currentDecisionContext({ uvIndex: 0, temperature: 0, crowding: 0, workers: 0, profileId }),
        feedback: 'worse',
        metrics: {},
        workspaceIssues: [{ issue: roomIssue, detail: issueDetail.trim() || undefined, severity: 2 }],
      })
      setRoomExperiences(saveRoomExperience({ roomId: selected.id, roomName: selected.name, issue: roomIssue, detail: issueDetail.trim() || `${roomIssue} needs attention`, status: 'reported' }))
      getWorkspaceIssues().then((response) => setWorkspaceEvidence(response.issues)).catch(() => undefined)
      setFeedbackStatus('saved')
    } catch { setFeedbackStatus('error') }
  }

  const confirmIssueResolved = async () => {
    if (!selected || !previousOpenIssue || !decision || !selectedOption) { setFeedbackStatus('error'); return }
    setFeedbackStatus('saving')
    try {
      await recordGraphOutcome({
        decisionId: decision.decisionId,
        capacityUnitId: selectedOption.id,
        demand: decision.demand,
        context: currentDecisionContext({ uvIndex: 0, temperature: 0, crowding: 0, workers: 0, profileId }),
        feedback: 'better',
        metrics: { roomFollowUpResolved: 1 },
      })
      setRoomExperiences(saveRoomExperience({ roomId: selected.id, roomName: selected.name, issue: previousOpenIssue.issue, detail: `${previousOpenIssue.issue} confirmed working after the previous report`, status: 'resolved' }))
      setShowRoomFeedback(false)
      setFeedbackStatus('idle')
    } catch { setFeedbackStatus('error') }
  }
  const availabilityUnknown = selected?.blockers.some((blocker) => /availab|owner/i.test(blocker)) ?? false

  return (
    <section className="space-experience">
      <aside className="space-search">
        {workerMode === 'mia' && <span className="step-kicker">MIA’S WORKSPACE NEEDS</span>}
        <h1>What space do you need?</h1>
        <p>{workerMode === 'mia' ? 'Ask for the meeting, time and the sun control Mia actually needs.' : 'Describe the meeting, time and equipment.'}</p>
        <label className="brief-composer"><span>SPACE BRIEF</span><textarea value={brief} onChange={(event) => { setBrief(event.target.value); setSearchError(false) }} rows={4}/></label>
        <div className="duration-picker"><span>DURATION</span><div>{[30, 45, 60, 90].map((minutes) => <button key={minutes} className={parsedDraft.durationMinutes === minutes ? 'is-active' : ''} onClick={() => setBrief((current) => withSpaceDuration(current, minutes))}>{minutes} min</button>)}</div></div>
        <button className="primary-action space-search-action" disabled={isSearching} onClick={() => void searchSpaces()}>{hasSearched ? 'Update matches' : 'Find rooms'} <ArrowRight size={17}/></button>
        {hasSearched && <div className="brief-understood brief-understood--result"><span>YOUR NEED {isSearching && <Activity size={12}/>}</span><div>{(decisionChips.length ? decisionChips : parsedBrief.chips).map((chip) => <b key={chip}>{chip}</b>)}</div></div>}
        {hasSearched && searchError && <RetryNotice title="Could not refresh this match" message="The room capabilities are still available. Retry when you are ready." onRetry={() => void searchSpaces()} retrying={isSearching}/>}
        {hasSearched && <><div className="space-match-count"><strong>{capabilityMatches.length}</strong><span>rooms fit the requested capability</span></div><div className="choice-list space-choice-list">{results.map((space) => <button key={space.id} onClick={() => chooseSpace(space.id)} className={selected?.id === space.id ? 'is-selected' : ''}><i/><div><span>{space.recommended ? 'BEST FIT' : space.eligible ? 'AVAILABLE NOW' : space.blockers.every((blocker) => /availab|owner/i.test(blocker)) ? 'FITS THE BRIEF' : 'DOESN’T FIT'}</span><strong>{space.name.replace('CDH ', '')}</strong><small>{seatsLeft(space)} seats left after your group · {space.facilities.slice(0, 2).join(' · ')}</small></div>{selected?.id === space.id && <Check size={16}/>}</button>)}</div></>}
      </aside>

      <div className={`space-canvas ${!hasSearched ? 'space-canvas--empty' : ''}`}>
        <div className="space-floor-label">CREMORNE ROOMS</div>
        {!hasSearched ? <div className="space-empty-state"><Building2/><strong>Describe the meeting first.</strong><span>We will show only rooms that fit the requested capacity and equipment.</span></div> : <>{results.map((space, index) => <button key={space.id} onClick={() => chooseSpace(space.id)} className={`room-shape room-${index + 1} ${selected?.id === space.id ? 'is-selected' : ''} ${space.eligible ? 'is-eligible' : 'is-blocked'}`}><Building2 /><strong>{space.name.replace('CDH ', '')}</strong><span>{seatsLeft(space)} seats left</span></button>)}<div className="floor-corridor">OWNER-OPEN TIME WINDOWS</div></>}
      </div>

      <aside className={`space-confirm ${!hasSearched ? 'space-confirm--empty' : ''}`}>
        {!hasSearched || !selected ? <div className="space-empty-detail"><CircleGauge/><strong>One clear match at a time</strong><span>Capacity, access, equipment, availability and previous user comments will appear here.</span></div> : <>
          <span className="step-kicker">{selected.eligible ? 'AVAILABLE NOW' : availabilityUnknown ? 'FITS THE BRIEF' : 'DOESN’T FIT'}</span>
          <h2>{selected.name}</h2>
          <div className="space-access-class">{(selectedOption?.accessClass ?? selected.accessClass) === 'internal' ? 'INTERNAL SPACE' : 'SHARED SPACE'}</div>
          <div className="capacity-number"><strong>{seatsLeft(selected)}</strong><span>seats left<br/>after this {parsedBrief.people}-person booking</span></div>
          <div className="facility-list">{selected.facilities.map((facility) => <span key={facility}>{facility}</span>)}</div>
          <p className="space-why"><strong>Why this room</strong>{availabilityUnknown
            ? `Fits ${parsedBrief.people} people and your requested equipment. Booking becomes available when the owner opens a matching time window.`
            : selectedOption?.explanation ?? `Fits ${parsedBrief.people} people for the requested ${parsedBrief.durationMinutes}-minute window.`}</p>
          {(previousOpenIssue || selectedEvidence.length > 0) && <div className="room-memory-card"><BrainCircuit/><div><span>WHAT PEOPLE NOTICED</span><strong>{previousOpenIssue ? `${previousOpenIssue.issue}: ${previousOpenIssue.detail}` : `${selectedEvidence[0].independentReporterCount} reports about ${selectedEvidence[0].issue}`}</strong><small>{previousOpenIssue ? 'After the meeting, tell us whether it has been fixed.' : selectedEvidence[0].status === 'validated' ? 'This now affects relevant room matches.' : 'CDH can review the repeated reports.'}</small></div></div>}
          {selected.eligible && bookingStage === 'available' && <><div className="booking-time"><Clock3 /><span><small>AVAILABLE WINDOW</small><strong>{selectedOption?.availableFrom ?? parsedBrief.timeLabel}–{selectedOption?.availableUntil ?? bookingEnd(parsedBrief.timeLabel, parsedBrief.durationMinutes)}</strong></span></div><button className="primary-action" onClick={() => setBookingStage('booked')}>Book {parsedBrief.durationMinutes} minutes <Check size={18} /></button></>}
          {selected.eligible && bookingStage === 'booked' && <div className="booking-flow booking-complete"><div className="arrival-icon"><Check/></div><span className="step-kicker">ROOM BOOKED</span><strong>{selected.name}</strong><p>{parsedBrief.timeLabel}–{bookingEnd(parsedBrief.timeLabel, parsedBrief.durationMinutes)} · {parsedBrief.people}-person meeting</p></div>}
          {!selected.eligible && availabilityUnknown && <div className="honest-gap"><Clock3/><div><strong>Fits your meeting</strong><span>No owner-open time is available for this request yet.</span></div></div>}
          {!selected.eligible && !availabilityUnknown && <div className="honest-gap"><ShieldAlert /><div><strong>Filtered by your need</strong><span>{selected.blockers.join(' · ')}</span></div></div>}
          {previousOpenIssue && decision && <div className="room-follow-up"><span>Last time: {previousOpenIssue.issue}</span><strong>Has it been fixed?</strong><div><button onClick={() => { setRoomIssue(previousOpenIssue.issue); setIssueDetail('The issue is still present.'); setShowRoomFeedback(true); setFeedbackStatus('idle') }}>Still a problem</button><button disabled={feedbackStatus === 'saving'} onClick={() => void confirmIssueResolved()}>Working now</button></div></div>}
          <button className="room-report-action" disabled={!decision} onClick={() => { setShowRoomFeedback(true); setFeedbackStatus('idle') }}><MessageSquare size={16}/><span><strong>User comments</strong><small>Share what worked or what needs attention</small></span><ArrowRight size={15}/></button>
        </>}
      </aside>

      {showRoomFeedback && selected && <div className="feedback-modal" role="dialog" aria-modal="true" aria-labelledby="room-feedback-title"><div className="feedback-modal__card"><button className="feedback-modal__close" aria-label="Close room feedback" onClick={() => setShowRoomFeedback(false)}><X size={18}/></button>{feedbackStatus !== 'saved' ? <><span className="step-kicker">ROOM EXPERIENCE</span><h2 id="room-feedback-title">What should the next worker know?</h2><p>{selected.name}</p><div className="issue-grid">{(['temperature', 'equipment', 'blinds', 'acoustics', 'accessibility'] as WorkspaceIssueKey[]).map((issue) => <button key={issue} className={roomIssue === issue ? 'is-active' : ''} onClick={() => setRoomIssue(issue)}>{issue}</button>)}</div><label><span>YOUR COMMENT</span><textarea value={issueDetail} onChange={(event) => setIssueDetail(event.target.value)} placeholder="For example: the adjustable blinds did not close." rows={3}/></label>{feedbackStatus === 'error' && <div className="honest-gap"><ShieldAlert/><div><strong>Could not save yet</strong><span>Wait a moment, then try once more.</span></div></div>}<button className="primary-action" disabled={feedbackStatus === 'saving'} onClick={() => void submitRoomFeedback()}>{feedbackStatus === 'saving' ? 'Saving…' : 'Save comment'} <ArrowRight size={17}/></button></> : <div className="feedback-success"><div className="arrival-icon"><Check/></div><span className="step-kicker">COMMENT SAVED</span><h2>Your next room search can improve.</h2><p>If others notice the same issue, CDH can review it for future matches.</p><button className="primary-action" onClick={() => setShowRoomFeedback(false)}>Done</button></div>}</div></div>}
    </section>
  )
}

function OperatorExperience({ weather, onSeeWorker }: {
  weather: { uvIndex: number }
  memory: MemoryRule[]
  setMemory: (memory: MemoryRule[]) => void
  onSeeWorker: () => void
}) {
  const journeyOutcomes = useMemo(() => loadJourneyOutcomes(), [])
  const latestJourney = journeyOutcomes[0]
  const [issues, setIssues] = useState<WorkspaceIssueRecord[]>([])
  const [candidateRoutes, setCandidateRoutes] = useState<CandidateRouteRecord[]>([])
  const [loadingIssues, setLoadingIssues] = useState(true)
  const [candidateUnderReview, setCandidateUnderReview] = useState<CandidateRouteRecord | null>(null)
  const [candidateReview, setCandidateReview] = useState({ durationMinutes: '', shadePercent: '', safeCapacity: '', confidence: '0.7', reason: '' })
  const [candidateReviewStatus, setCandidateReviewStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const [issuesError, setIssuesError] = useState(false)
  const [reviewingIssueId, setReviewingIssueId] = useState<string | null>(null)
  const hotspot = productContext.hotspots[0]
  const direct = productContext.routeSets['east-richmond'][0]
  const canopy = productContext.routeSets['east-richmond'][2]
  const refreshIssues = async () => {
    setLoadingIssues(true); setIssuesError(false)
    try { setIssues((await getWorkspaceIssues()).issues) } catch { setIssuesError(true) }
    finally { setLoadingIssues(false) }
  }
  useEffect(() => {
    let active = true
    Promise.all([getWorkspaceIssues(), getCandidateRoutes()]).then(([issueResponse, routeResponse]) => {
      if (active) { setIssues(issueResponse.issues); setCandidateRoutes(routeResponse.candidates) }
    }).catch(() => {
      if (active) setIssuesError(true)
    }).finally(() => {
      if (active) setLoadingIssues(false)
    })
    return () => { active = false }
  }, [])
  const validateIssue = async (issue: WorkspaceIssueRecord) => {
    setReviewingIssueId(issue.id); setIssuesError(false)
    try {
      await reviewWorkspaceIssue({ issueId: issue.id, decision: 'validate', reason: `CDH confirmed the repeated ${issue.issue} reports.` })
      await refreshIssues()
    } catch { setIssuesError(true) }
    finally { setReviewingIssueId(null) }
  }
  const openCandidateReview = (candidate: CandidateRouteRecord) => {
    setCandidateUnderReview(candidate)
    setCandidateReview({
      durationMinutes: candidate.metrics.elapsedSeconds ? String(Number((candidate.metrics.elapsedSeconds / 60).toFixed(1))) : '',
      shadePercent: candidate.metrics.shadePercent ? String(candidate.metrics.shadePercent) : '',
      safeCapacity: candidate.metrics.safeCapacity ? String(candidate.metrics.safeCapacity) : '',
      confidence: candidate.validationConfidence ? String(candidate.validationConfidence) : '0.7',
      reason: '',
    })
    setCandidateReviewStatus('idle')
  }
  const submitCandidateReview = async (decision: 'validate' | 'reject') => {
    if (!candidateUnderReview) return
    const durationMinutes = Number(candidateReview.durationMinutes)
    const shadePercent = Number(candidateReview.shadePercent)
    const safeCapacity = Number(candidateReview.safeCapacity)
    const confidence = Number(candidateReview.confidence)
    const hasEvidence = durationMinutes > 0 && shadePercent >= 0 && shadePercent <= 100 && safeCapacity > 0 && confidence > 0 && confidence <= 1
    if (!candidateReview.reason.trim() || (decision === 'validate' && !hasEvidence)) { setCandidateReviewStatus('error'); return }
    setCandidateReviewStatus('saving')
    try {
      await reviewCandidateRoute({
        candidateCapacityId: candidateUnderReview.id,
        decision,
        reason: candidateReview.reason.trim(),
        evidence: decision === 'validate' ? { durationMinutes, shadePercent, safeCapacity, confidence } : undefined,
      })
      setCandidateRoutes((await getCandidateRoutes()).candidates)
      setCandidateUnderReview(null)
      setCandidateReviewStatus('idle')
    } catch { setCandidateReviewStatus('error') }
  }
  return (
    <main className="operator-clear">
      <header className="operator-heading"><div><span className="step-kicker">CDH EVIDENCE LAB</span><h1>Turn fragmented evidence into the next guided action.</h1></div><div className="demo-context"><span><Sun size={15}/>UV {weather.uvIndex ? weather.uvIndex.toFixed(1) : '—'}</span><span><Activity size={15}/>6 smart-pole locations</span></div></header>
      <section className="operator-workbench">
        <div className="operator-scene">
          <div className="scene-top"><span><Activity size={15}/>{hotspot.name}</span><span><Users size={15}/>{hotspot.surveyedPedestrianMovements.toLocaleString()} surveyed movements</span></div>
          <svg viewBox="0 0 780 420" role="img" aria-label="Real-data pilot across three pedestrian routes"><path className="op-road road-a" d="M70 350 C220 270 310 225 430 195 S620 135 710 62"/><path className="op-road road-b" d="M70 350 C205 175 335 100 485 125 S620 108 710 62"/><path className="op-road road-c" d="M70 350 C220 360 350 330 470 270 S635 150 710 62"/><circle className="op-traveller traveller-c" r="8"><animateMotion dur="2.6s" repeatCount="indefinite" path="M70 350 C220 360 350 330 470 270 S635 150 710 62"/></circle><g className="op-blocks"><rect x="190" y="280" width="95" height="67"/><rect x="360" y="155" width="105" height="72"/><rect x="545" y="75" width="92" height="70"/></g><circle className="op-origin" cx="70" cy="350" r="13"/><circle className="op-target" cx="710" cy="62" r="13"/></svg>
          <div className="scene-legend"><span><i className="a"/>Alternative A</span><span><i className="b"/>Direct B · {direct.durationMin} min</span><span><i className="c"/>Canopy C · {canopy.canopyAdjacentPct}% canopy</span></div>
        </div>
        <aside className="operator-decision">
          <span className="step-kicker">REAL-DATA PILOT</span><h2>Measure what the map cannot see.</h2>
          <div className="result-pair"><div><span>DIRECT B</span><strong>{direct.durationMin} min</strong><small>{direct.canopyAdjacentPct}% canopy-adjacent</small></div><div><span>CANOPY C</span><strong>{canopy.durationMin} min</strong><small>{canopy.canopyAdjacentPct}% canopy-adjacent</small></div></div>
          {latestJourney ? <div className="operator-observed"><span>LATEST WORKER OUTCOME</span><strong>{latestJourney.routeName} · {latestJourney.feedback}</strong><div><b>{Math.max(1, Math.round(latestJourney.elapsedSeconds / 60))} min journey</b>{latestJourney.crossingWaitMinutes != null && <b>{latestJourney.crossingWaitMinutes} min crossing wait</b>}{latestJourney.directSunMinutes != null && <b>{latestJourney.directSunMinutes} min direct sun</b>}</div></div> : <div className="brief-understood"><span>FIELD OUTCOME</span><div><b>journey time</b><b>crossing wait</b><b>direct-sun minutes</b><b>worker experience</b></div></div>}
          <div className="operator-signal operator-signal--compact"><strong>{issues.filter((issue) => issue.status === 'candidate').length}</strong><span>room issues ready for CDH review</span></div>
          <div className="operator-issue-list">{issuesError ? <RetryNotice title="Room evidence unavailable" message="The current review list could not be loaded or updated." onRetry={() => void refreshIssues()} retrying={loadingIssues}/> : loadingIssues ? <small>Loading room evidence…</small> : issues.length === 0 ? <small>No repeated room issue has reached the review threshold.</small> : issues.slice(0, 3).map((issue) => <div key={issue.id}><span><strong>{issue.capacityName}</strong><small>{issue.issue} · {issue.independentReporterCount} independent reports · {issue.status}</small></span>{issue.status === 'candidate' && <button disabled={reviewingIssueId === issue.id} onClick={() => void validateIssue(issue)}>{reviewingIssueId === issue.id ? 'Validating…' : 'Validate'}</button>}</div>)}</div>
          <div className="operator-signal operator-signal--compact"><strong>{candidateRoutes.filter((route) => route.status === 'candidate').length}</strong><span>worker-proposed routes awaiting review</span></div>
          <div className="operator-issue-list">{loadingIssues ? <small>Loading proposed routes…</small> : candidateRoutes.length === 0 ? <small>No proposed route is waiting for review.</small> : candidateRoutes.slice(0, 2).map((candidate) => <div key={candidate.id}><span><strong>{candidate.name}</strong><small>{candidate.geometry.length} points · {candidate.status}</small></span>{candidate.status === 'candidate' && <button onClick={() => openCandidateReview(candidate)}>Review</button>}</div>)}</div>
          <button className="primary-action" onClick={onSeeWorker}>Open the worker journey <ArrowRight size={18}/></button>
        </aside>
      </section>
      <section className="technical-drawer" aria-label="Evidence learning loop">
        <div><strong>1 · PUBLIC BASELINE</strong><span>Yarra + DTP + routes + canopy</span></div><ArrowRight/>
        <div><strong>2 · PILOT</strong><span>real journey / room outcome</span></div><ArrowRight/>
        <div><strong>3 · REVIEW</strong><span>repeat evidence + CDH check</span></div><ArrowRight/>
        <div><strong>4 · MEMORY</strong><span>need + context + boundary</span></div><ArrowRight/>
        <div><strong>5 · NEXT MATCH</strong><span>ranking changes</span></div>
      </section>
      {candidateUnderReview && <div className="feedback-modal" role="dialog" aria-modal="true" aria-labelledby="candidate-review-title"><div className="feedback-modal__card candidate-review-card"><button className="feedback-modal__close" aria-label="Close candidate route review" onClick={() => setCandidateUnderReview(null)}><X size={18}/></button><span className="step-kicker">FIELD REVIEW</span><h2 id="candidate-review-title">Validate {candidateUnderReview.name}</h2><p>A proposed path remains private to the review queue until measured evidence supports wider guidance.</p><div className="candidate-evidence-grid"><label><span>JOURNEY MINUTES</span><input inputMode="decimal" value={candidateReview.durationMinutes} onChange={(event) => setCandidateReview((current) => ({ ...current, durationMinutes: event.target.value }))}/></label><label><span>CANOPY %</span><input inputMode="decimal" value={candidateReview.shadePercent} onChange={(event) => setCandidateReview((current) => ({ ...current, shadePercent: event.target.value }))}/></label><label><span>SAFE CAPACITY</span><input inputMode="numeric" value={candidateReview.safeCapacity} onChange={(event) => setCandidateReview((current) => ({ ...current, safeCapacity: event.target.value }))}/></label><label><span>CONFIDENCE 0–1</span><input inputMode="decimal" value={candidateReview.confidence} onChange={(event) => setCandidateReview((current) => ({ ...current, confidence: event.target.value }))}/></label></div><label className="candidate-review-reason"><span>REVIEW NOTE</span><textarea rows={2} value={candidateReview.reason} onChange={(event) => setCandidateReview((current) => ({ ...current, reason: event.target.value }))} placeholder="What did the field check confirm?"/></label>{candidateReviewStatus === 'error' && <div className="honest-gap"><ShieldAlert/><div><strong>Complete the field evidence</strong><span>Validation needs measured time, canopy, capacity, confidence and a review note.</span></div></div>}<div className="candidate-review-actions"><button disabled={candidateReviewStatus === 'saving'} className="secondary-action" onClick={() => void submitCandidateReview('reject')}>Reject</button><button disabled={candidateReviewStatus === 'saving'} className="primary-action" onClick={() => void submitCandidateReview('validate')}>{candidateReviewStatus === 'saving' ? 'Saving…' : 'Validate route'} <Check size={17}/></button></div></div></div>}
    </main>
  )
}

export default function App() {
  return window.location.pathname.startsWith(PATHS.product) ? <ProductApp /> : <Landing />
}
