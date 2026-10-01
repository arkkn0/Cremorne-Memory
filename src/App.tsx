import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowLeft, ArrowRight, BrainCircuit, Building2, Check,
  CircleGauge, Clock3, FlaskConical, Home, Map as MapIcon,
  MessageSquare, Navigation, Play, RefreshCw, ShieldAlert, Sparkles, Sun, Trees, Users, X,
} from 'lucide-react'
import CremorneMap from './CremorneMap'
import { currentDecisionContext, getCandidateRoutes, getRouteExceptions, getWorkspaceIssues, recommendCapacity, recordGraphOutcome, reviewCandidateRoute, reviewRouteException, reviewWorkspaceIssue } from './api'
import type { CandidateRouteRecord, RecommendResponse, RouteExceptionRecord, WorkspaceIssueKey, WorkspaceIssueRecord } from './api-contracts'
import { loadJourneyOutcomes, loadMemory, loadRoomExperiences, saveJourneyOutcome, saveRoomExperience } from './memory'
import type { RoomExperience } from './memory'
import type { MemoryRule } from './domain'
import {
  demandAtTime, evaluateProductRoutes, findSpaces, parseRouteBrief, parseSpaceBrief, productContext,
} from './product'
import type { EvaluatedProductRoute } from './product'
import { distanceMetres, distanceToPolyline, isDistinctJourneyTrace, type JourneyPoint } from './journey-trace'

type ProductRole = 'demo' | 'worker' | 'operator'
type WorkerTask = 'route' | 'space'
type WorkerMode = 'mia' | 'explore'
type JourneyStage = 'setup' | 'results' | 'active' | 'feedback' | 'saved'
type JourneyTrackingState = 'idle' | 'starting' | 'tracking' | 'outside-area' | 'unavailable'
type DemoStage = 'scenario' | 'first-pass' | 'reveal' | 'remembered'
type WeatherPoint = { time: string; temperature: number; uvIndex: number }
type WeatherState = { temperature: number; uvIndex: number; source: string; forecast: WeatherPoint[] }

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast?latitude=-37.83&longitude=144.995&hourly=temperature_2m%2Cuv_index&forecast_days=2&timezone=Australia%2FSydney'
const FORECAST_CACHE_KEY = 'cremorne-memory:forecast-v1'
const MIA_ROUTE_BRIEF = 'Get me to East Richmond by 4:20pm with minimal direct sun. I can wait up to 10 minutes.'
const MIA_ROOM_BRIEF = 'Find a 6-person hybrid room at 2pm for 45 minutes with adjustable blinds.'

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
  const [weather, setWeather] = useState<WeatherState>({ temperature: 0, uvIndex: 0, source: 'Loading forecast', forecast: [] })
  useEffect(() => {
    const controller = new AbortController()
    const applyForecast = (data: { forecast?: WeatherPoint[] }, source: string) => {
      const localHour = sydneyHourKey(new Date())
      const forecast = data.forecast ?? []
      const point = forecast.find((candidate) => candidate.time === localHour) ?? forecast.find((candidate) => candidate.time >= localHour)
      if (!point) return false
      const next = { temperature: point.temperature, uvIndex: point.uvIndex, source, forecast }
      setWeather(next)
      window.localStorage.setItem(FORECAST_CACHE_KEY, JSON.stringify({ ...next, cachedAt: Date.now() }))
      return true
    }
    const normaliseOpenMeteo = (data: { hourly?: { time?: string[]; temperature_2m?: number[]; uv_index?: number[] } }) => ({
      forecast: (data.hourly?.time ?? []).flatMap((time, index) => {
        const temperature = Number(data.hourly?.temperature_2m?.[index])
        const uvIndex = Number(data.hourly?.uv_index?.[index])
        return Number.isFinite(temperature) && Number.isFinite(uvIndex) ? [{ time, temperature, uvIndex }] : []
      }),
    })
    const load = async () => {
      try {
        const response = await fetch('/api/context', { signal: controller.signal })
        if (response.ok && applyForecast(await response.json(), 'Cremorne forecast · Open-Meteo')) return
      } catch { /* browser fallback below */ }
      try {
        const response = await fetch(FORECAST_URL, { signal: controller.signal })
        if (response.ok && applyForecast(normaliseOpenMeteo(await response.json()), 'Cremorne forecast · Open-Meteo')) return
      } catch { /* cached fallback below */ }
      try {
        const cached = JSON.parse(window.localStorage.getItem(FORECAST_CACHE_KEY) ?? 'null') as (WeatherState & { cachedAt: number }) | null
        if (cached?.forecast.length && Date.now() - cached.cachedAt < 6 * 60 * 60 * 1000) {
          setWeather({ temperature: cached.temperature, uvIndex: cached.uvIndex, forecast: cached.forecast, source: 'Recent Cremorne forecast' })
          return
        }
      } catch { /* no cached forecast */ }
      setWeather({ temperature: 0, uvIndex: 0, source: 'Forecast unavailable', forecast: [] })
    }
    void load()
    return () => controller.abort()
  }, [])
  return weather
}

function sydneyHourKey(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:00`
}

function weatherAtClock(weather: WeatherState, clock: string) {
  if (!weather.forecast.length) return { temperature: weather.temperature, uvIndex: weather.uvIndex, time: clock, available: false }
  const [hour] = clock.split(':').map(Number)
  const currentHour = sydneyHourKey(new Date())
  const targetSuffix = `T${String(hour).padStart(2, '0')}:00`
  const point = weather.forecast.find((candidate) => candidate.time >= currentHour && candidate.time.endsWith(targetSuffix))
  return point ? { ...point, available: true } : { temperature: weather.temperature, uvIndex: weather.uvIndex, time: clock, available: false }
}

function ProductApp() {
  const [role, setRole] = useState<ProductRole>('worker')
  const [task, setTask] = useState<WorkerTask>('route')
  const [workerMode, setWorkerMode] = useState<WorkerMode>('mia')
  const [memory, setMemory] = useState<MemoryRule[]>(() => loadMemory())
  const weather = useWeather()
  return (
    <div className="product-clear">
      <header className="product-clear__header">
        <Brand />
        <div className="role-switch" role="group" aria-label="Choose product role">
          <button className={role === 'worker' ? 'is-active' : ''} onClick={() => setRole('worker')}><Users size={16} /> For workers</button>
          <button className={role === 'operator' ? 'is-active' : ''} onClick={() => setRole('operator')}><FlaskConical size={16} /> For operators</button>
        </div>
        <div className="product-status"><button className="memory-proof-link" onClick={() => setRole('demo')}><Sparkles size={15}/><span>How it learns</span></button><a href={PATHS.landing}><Home size={17} /><span>Home</span></a></div>
      </header>
      {role === 'demo' && <GuidedDemo weather={weather} onOpenWorker={() => { setWorkerMode('mia'); setRole('worker'); setTask('route') }} />}
      {role === 'worker' && <WorkerExperience task={task} setTask={setTask} weather={weather} memory={memory} workerMode={workerMode} />}
      {role === 'operator' && <OperatorExperience weather={weather} memory={memory} setMemory={setMemory} onSeeWorker={() => { setWorkerMode('mia'); setRole('worker'); setTask('route') }} />}
    </div>
  )
}

function GuidedDemo({ weather, onOpenWorker }: {
  weather: WeatherState
  onOpenWorker: () => void
}) {
  const [stage, setStage] = useState<DemoStage>('scenario')
  const [decision, setDecision] = useState<RecommendResponse | null>(null)
  const [running, setRunning] = useState(false)
  const hotspot = productContext.hotspots[0]
  const direct = productContext.routeSets['east-richmond'][0]
  const canopy = productContext.routeSets['east-richmond'][2]
  const extraSeconds = Math.round((canopy.durationMin - direct.durationMin) * 60)
  const canopyGain = canopy.canopyAdjacentPct - direct.canopyAdjacentPct
  const progress = stage === 'scenario' ? 0 : stage === 'first-pass' ? 1 : stage === 'reveal' ? 2 : 3
  const requestBrief = stage === 'scenario' || stage === 'first-pass'
    ? 'Get me to East Richmond by 4:20pm. Fastest route.'
    : MIA_ROUTE_BRIEF
  const parsed = parseRouteBrief(requestBrief)
  const predicted = weatherAtClock(weather, parsed.deadlineLabel)
  const workers = demandAtTime(parsed.destination, parsed.departure)
  const localRoutes = evaluateProductRoutes({ destination: parsed.destination, need: parsed.need, strength: parsed.strength, uvIndex: predicted.uvIndex, workers })
  const demoRoutes = localRoutes.map((route) => {
    const option = decision?.options.find((candidate) => candidate.productId === route.id)
    return option ? { ...route, eligible: option.eligible, recommended: option.recommended, score: option.score, reasons: option.reasons, name: option.name } : route
  }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || Number(b.recommended) - Number(a.recommended) || a.score - b.score)
  const selectedDemoRoute = demoRoutes.find((route) => route.recommended) ?? demoRoutes[0]
  const runDecision = async (nextStage: DemoStage, brief: string, useMemory: boolean) => {
    setRunning(true)
    const demand = parseRouteBrief(brief)
    const atUse = weatherAtClock(weather, demand.deadlineLabel)
    try {
      const response = await recommendCapacity({ brief, context: currentDecisionContext({ uvIndex: atUse.uvIndex, temperature: atUse.temperature, crowding: 0, workers: demandAtTime(demand.destination, demand.departure), profileId: browserProfileId() }), useMemory })
      setDecision(response)
      setStage(nextStage)
    } catch {
      setDecision(null)
      setStage(nextStage)
    } finally { setRunning(false) }
  }

  return (
    <main className={`guided-demo demo-${stage}`}>
      <header className="demo-heading">
        <div><span>30-SECOND LIVE PROOF</span><h1>One real hotspot. Three routes. One learning loop.</h1></div>
        <div className="demo-context"><span><Activity/>Yarra count</span><span><Trees/>Vicmap canopy</span><span><Navigation/>Valhalla routes</span></div>
      </header>

      <section className="demo-workbench">
        <div className="demo-visual">
          <div className="mia-chip"><div>M</div><span><small>MIA · LOW UV REQUIRED</small><strong>Arrive at East Richmond by 4:20</strong></span></div>
          <CremorneMap routes={demoRoutes} selectedId={selectedDemoRoute?.id} onSelect={() => undefined} showTrees showFlow={stage !== 'scenario'} />
          <div className="demo-live-source"><Activity/><span><small>LIVE MATCH</small><strong>{running ? 'Comparing current options…' : decision ? 'Route choices updated' : 'Ready'}</strong></span></div>
          {stage === 'remembered' && <div className="memory-retrieved"><BrainCircuit/><span>LOCAL MEMORY<strong>{decision?.retrievedMemory.length ? `${decision.retrievedMemory.length} relevant outcome${decision.retrievedMemory.length === 1 ? '' : 's'} applied` : 'The next outcome starts the Memory'}</strong></span></div>}
        </div>

        <aside className="demo-story" aria-live="polite">
          {stage === 'scenario' && <div className="demo-story__stage" key="scenario">
            <span className="step-kicker">1 · DOCUMENTED HOTSPOT</span>
            <h2>{hotspot.name}</h2>
            <p>Yarra recorded the precinct’s highest pedestrian volumes at this gateway.</p>
            <div className="demo-question"><span>AM + PM PEAK · 2 HOURS</span><strong>{hotspot.surveyedPedestrianMovements.toLocaleString()} movements</strong><ArrowRight/></div>
            <button className="primary-action" disabled={running} onClick={() => void runDecision('first-pass', 'Get me to East Richmond by 4:20pm. Fastest route.', false)}>{running ? 'Matching…' : 'Compare real routes'} <Play size={18}/></button>
          </div>}
          {stage === 'first-pass' && <div className="demo-story__stage" key="first-pass">
            <span className="step-kicker">2 · FASTEST FIRST</span>
            <h2>Route B wins on travel time.</h2>
            <div className="result-pair"><div><span>ROUTE B</span><strong>{direct.durationMin} min</strong><small>{direct.canopyAdjacentPct}% canopy-adjacent</small></div><div><span>ROUTE C</span><strong>{canopy.durationMin} min</strong><small>{canopy.canopyAdjacentPct}% canopy-adjacent</small></div></div>
            <div className="apparent-winner"><Check/><span><small>FASTEST PUBLIC ROUTE</small><strong>Route B · Direct</strong></span></div>
            <button className="primary-action" disabled={running} onClick={() => void runDecision('reveal', MIA_ROUTE_BRIEF, false)}>{running ? 'Applying Mia’s need…' : 'Now add Mia’s need'} <ArrowRight size={18}/></button>
          </div>}
          {stage === 'reveal' && <div className="demo-story__stage" key="reveal">
            <span className="step-kicker coral">3 · USABLE FOR WHOM?</span>
            <h2>For Mia, 36 seconds changes the trade-off.</h2>
            <div className="demo-exceptions"><div><Clock3/><span>EXTRA WALK<strong>+{extraSeconds} sec</strong></span></div><div><Trees/><span>CANOPY ADJACENCY<strong>+{canopyGain} points</strong></span></div></div>
            <p className="demo-insight">The field pilot measures direct-sun minutes, crossing wait and the worker outcome.</p>
            <button className="primary-action" disabled={running} onClick={() => void runDecision('remembered', MIA_ROUTE_BRIEF, true)}>{running ? 'Retrieving Memory…' : 'Apply Memory to the next match'} <BrainCircuit size={18}/></button>
          </div>}
          {stage === 'remembered' && <div className="demo-story__stage" key="remembered">
            <span className="step-kicker">4 · USE, MEASURE, IMPROVE</span>
            <h2>The next match starts with what happened.</h2>
            <div className="remembered-choice blocked"><Activity/><span><small>WORKER OUTCOME</small><strong>Time · direct sun · crossing wait · experience</strong></span></div>
            <div className="remembered-choice eligible"><Check/><span><small>NEXT MATCH</small><strong>The same need does not start from zero</strong></span></div>
            <div className="remembered-rule"><span>WORKER CHOOSES</span><strong>the outcome is measured</strong><span>CREMORNE LEARNS</span><strong>the next match improves</strong></div>
            <button className="primary-action" onClick={onOpenWorker}>Continue as Mia <ArrowRight size={18}/></button>
            <button className="secondary-action" onClick={() => { setDecision(null); setStage('scenario') }}>Replay the proof</button>
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
      </header>
      {task === 'route' ? <RouteJourney key={`route-${workerMode}`} weather={weather} memory={memory} workerMode={workerMode} /> : <SpaceJourney key={`space-${workerMode}`} workerMode={workerMode} />}
    </main>
  )
}

function JourneyProgress({ stage }: { stage: JourneyStage }) {
  const current = stage === 'setup' ? 0 : stage === 'results' ? 1 : stage === 'active' ? 2 : stage === 'feedback' ? 3 : 4
  return <div className="journey-progress" aria-label="Journey steps"><b>YOUR JOURNEY</b><div>{['Describe', 'Choose', 'Follow', 'Reflect'].map((label, index) => <span key={label} className={`${current === index ? 'is-current' : ''} ${current > index ? 'is-complete' : ''}`}><i>{current > index ? <Check size={10} /> : null}</i>{label}</span>)}</div></div>
}

function RetryNotice({ title, message, onRetry, retrying = false }: {
  title: string
  message: string
  onRetry: () => void
  retrying?: boolean
}) {
  return <div className="honest-gap action-error" role="alert"><ShieldAlert/><div><strong>{title}</strong><span>{message}</span></div><button disabled={retrying} onClick={onRetry}><RefreshCw size={13}/>{retrying ? 'Retrying' : 'Retry'}</button></div>
}

function TracePreview({ points, planned = [] }: { points: JourneyPoint[]; planned?: JourneyPoint[] }) {
  const toPath = (source: JourneyPoint[]) => {
    if (source.length < 2) return ''
    const lats = source.map((point) => point[0])
    const lngs = source.map((point) => point[1])
    const minLat = Math.min(...lats); const maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs); const maxLng = Math.max(...lngs)
    const width = Math.max(0.00001, maxLng - minLng)
    const height = Math.max(0.00001, maxLat - minLat)
    return source.map(([lat, lng], index) => {
      const x = 10 + (lng - minLng) / width * 140
      const y = 50 - (lat - minLat) / height * 40
      return `${index ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`
    }).join(' ')
  }
  const actualPath = useMemo(() => toPath(points), [points])
  const plannedPath = useMemo(() => toPath(planned), [planned])
  if (!actualPath && !plannedPath) return <div className="trace-preview trace-preview--empty">Route shape unavailable</div>
  return <svg className={`trace-preview ${actualPath ? 'has-actual-path' : 'planned-only'}`} viewBox="0 0 160 60" role="img" aria-label={actualPath ? 'The GPS path walked on this journey' : 'The selected route shape'}>{plannedPath && <path className="trace-preview__planned" d={plannedPath} />}{actualPath && <path className="trace-preview__actual" d={actualPath} />}<circle cx="12" cy="44" r="4"/><circle cx="148" cy="15" r="4"/></svg>
}

function RouteJourney({ weather, memory, workerMode }: { weather: WeatherState; memory: MemoryRule[]; workerMode: WorkerMode }) {
  const [stage, setStage] = useState<JourneyStage>('setup')
  const [brief, setBrief] = useState(workerMode === 'mia'
    ? MIA_ROUTE_BRIEF
    : 'Get me to Richmond by 5:30pm. Prefer a less crowded route. I can wait up to 15 minutes.')
  const [selectedId, setSelectedId] = useState<string>()
  const [startedAt, setStartedAt] = useState<number>()
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [personalOutcomes, setPersonalOutcomes] = useState(() => loadJourneyOutcomes())
  const [decision, setDecision] = useState<RecommendResponse | null>(null)
  const [isFinding, setIsFinding] = useState(false)
  const [showAllRoutes, setShowAllRoutes] = useState(false)
  const [clarification, setClarification] = useState<string | null>(null)
  const [routeError, setRouteError] = useState(false)
  const [journeyTrace, setJourneyTrace] = useState<JourneyPoint[]>([])
  const [trackingState, setTrackingState] = useState<JourneyTrackingState>('idle')
  const [feedback, setFeedback] = useState<'better' | 'same' | 'worse' | null>(null)
  const [crossingWaitMinutes, setCrossingWaitMinutes] = useState('')
  const [directSunMinutes, setDirectSunMinutes] = useState('')
  const [outcomeStatus, setOutcomeStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [shareStatus, setShareStatus] = useState<'idle' | 'sharing' | 'shared' | 'kept-private' | 'error'>('idle')
  const [shareChoice, setShareChoice] = useState(false)
  const [journeyIntent, setJourneyIntent] = useState<'guided' | 'discover'>('guided')
  const watchId = useRef<number | null>(null)
  const decisionRequest = useRef<Promise<RecommendResponse> | null>(null)
  const prefetchedBrief = useRef<string | null>(null)
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
  const selectedDecisionOption = decision?.options.find((option) => option.productId === selected?.id)
  const noEligible = routes.every((route) => !route.eligible)
  const visibleRouteChoices = showAllRoutes ? routes : routes.slice(0, 2)
  const directRoute = routes.find((route) => route.id === 'route-east-richmond-direct') ?? routes.find((route) => /Direct/i.test(route.name))
  const routeTradeoff = selected && directRoute && selected.id !== directRoute.id
    ? { seconds: Math.round((selected.durationMin - directRoute.durationMin) * 60), canopy: selected.canopyAdjacentPct - directRoute.canopyAdjacentPct }
    : null
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

  useEffect(() => {
    if (workerMode !== 'mia' || brief !== MIA_ROUTE_BRIEF || weather.source === 'Loading forecast' || decisionRequest.current) return
    prefetchedBrief.current = brief
    const pending = recommendCapacity({
      brief,
      context: currentDecisionContext({ uvIndex: timeOfUseWeather.uvIndex, temperature: timeOfUseWeather.temperature, crowding: 0, workers, profileId }),
      useMemory: true,
    })
    decisionRequest.current = pending
    void pending.catch(() => {
      if (decisionRequest.current === pending) {
        decisionRequest.current = null
        prefetchedBrief.current = null
      }
    })
  }, [brief, profileId, timeOfUseWeather.temperature, timeOfUseWeather.uvIndex, weather.source, workerMode, workers])

  const resetForInput = () => { setStage('setup'); setSelectedId(undefined); setShowAllRoutes(false); setStartedAt(undefined); setElapsedSeconds(0); setDecision(null); decisionRequest.current = null; prefetchedBrief.current = null; setClarification(null); setRouteError(false); setJourneyTrace([]); setTrackingState('idle'); setFeedback(null); setCrossingWaitMinutes(''); setDirectSunMinutes(''); setOutcomeStatus('idle'); setShareStatus('idle'); setJourneyIntent('guided') }
  const findRoutes = () => {
    setClarification(null); setRouteError(false); setDecision(null); setShowAllRoutes(false)
    const instantPreferred = localRoutes.find((route) => route.recommended && route.eligible)?.id ?? localRoutes.find((route) => route.eligible)?.id
    setSelectedId(instantPreferred)
    setStage('results')
    setIsFinding(true)
    const pending = prefetchedBrief.current === brief && decisionRequest.current ? decisionRequest.current : recommendCapacity({ brief, context: currentDecisionContext({ uvIndex: timeOfUseWeather.uvIndex, temperature: timeOfUseWeather.temperature, crowding: 0, workers, profileId }), useMemory: true })
    decisionRequest.current = pending
    prefetchedBrief.current = brief
    void pending.then((response) => {
      setDecision(response)
      if (response.clarification) { setClarification(response.clarification); setStage('setup'); return }
      const preferred = response.recommendation?.productId ?? response.options.find((option) => option.eligible)?.productId
      setSelectedId((current) => current ?? preferred)
    }).catch(() => {
      // Deterministic local matching is already usable; retain it if the remote
      // explanation or graph enrichment is temporarily unavailable.
      setDecision(null)
    }).finally(() => setIsFinding(false))
  }
  const startJourney = (intent: 'guided' | 'discover' = 'guided') => {
    setJourneyIntent(intent)
    setStartedAt(Date.now()); setElapsedSeconds(0); setJourneyTrace([]); setTrackingState('starting'); setStage('active')
    if (navigator.geolocation) {
      watchId.current = navigator.geolocation.watchPosition(({ coords }) => {
        const point: JourneyPoint = [coords.latitude, coords.longitude]
        if (distanceToPolyline(point, selected.coordinates) > 650) { setTrackingState('outside-area'); return }
        setTrackingState('tracking')
        setJourneyTrace((current) => {
          if (current.length && distanceMetres(current.at(-1)!, point) < 4) return current
          return [...current, point].slice(-250)
        })
      }, () => setTrackingState('unavailable'), { enableHighAccuracy: true, maximumAge: 5_000, timeout: 12_000 })
    } else setTrackingState('unavailable')
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
        ...(timeOfUseWeather.available ? { exposureIndex: selected.exposureIndex } : {}),
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
      ...(timeOfUseWeather.available ? { exposureIndex: selected.exposureIndex } : {}),
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
  return (
    <section className="route-experience">
      <aside className="journey-panel">
        {(stage === 'active' || stage === 'feedback' || stage === 'saved') && <JourneyProgress stage={stage} />}
        {stage === 'setup' && <div className="journey-step">
          {workerMode === 'mia' && <span className="step-kicker">MIA · LOW UV REQUIRED</span>}<h1>What journey do you need?</h1><p>{workerMode === 'mia' ? 'Travel time, canopy evidence and her low-UV requirement shape Mia’s options.' : 'Describe it in your own words.'}</p>
          <label className="brief-composer"><span>JOURNEY BRIEF</span><textarea value={brief} onChange={(event) => { setBrief(event.target.value); resetForInput() }} rows={4}/></label>
          {clarification && <div className="honest-gap"><ShieldAlert/><div><strong>Which destination?</strong><span>{clarification}</span></div></div>}
          <button className="primary-action" aria-busy={isFinding} onClick={findRoutes}>Find guided actions <ArrowRight size={18} /></button>
          {routeError && <RetryNotice title="Could not match this journey" message="The brief is unchanged. Try the decision again." onRetry={() => void findRoutes()}/>}
        </div>}

        {stage === 'results' && <div className="journey-step">
          <button className="back-action" onClick={() => setStage('setup')}><ArrowLeft size={15} /> Change brief</button><h1>{noEligible ? 'No route fits every need yet.' : 'Choose your route.'}</h1><p>{noEligible ? 'Try changing one requirement or departure time.' : `${routes.filter((route) => route.eligible).length} routes fit your brief`}</p>
          <div className="brief-understood brief-understood--result"><span>YOUR NEED</span><div>{(decisionChips.length ? decisionChips : parsedBrief.chips).map((chip) => <b key={chip}>{chip}</b>)}</div></div>
          {noEligible ? <div className="honest-gap"><ShieldAlert /><div><strong>No eligible route</strong><span>{routes[0]?.reasons[0]}</span></div></div> : <><div className="choice-list">{visibleRouteChoices.map((route) => <button key={route.id} disabled={!route.eligible} onClick={() => setSelectedId(route.id)} className={`${selected.id === route.id ? 'is-selected' : ''} ${!route.eligible ? 'is-blocked' : ''}`}><i /><div><span>{route.recommended ? 'BEST FIT' : route.eligible ? 'ALTERNATIVE' : 'NOT ELIGIBLE'}</span><strong>{route.name}</strong><small>{route.eligible ? `${route.durationMin} min walk · ${route.canopyAdjacentPct}% canopy-adjacent` : routeReason(route)}</small>{selected.id === route.id && route.eligible && <small className="route-why-inline"><Check size={11}/>{routeReason(route)}</small>}</div>{selected.id === route.id && <Check size={17} />}</button>)}</div>{routes.length > 2 && <button className="more-route-action" onClick={() => setShowAllRoutes((current) => !current)}>{showAllRoutes ? 'Show fewer routes' : `Show ${routes.length - 2} more option`}</button>}</>}
          {!noEligible && <div className="journey-actions"><button className="primary-action" onClick={() => startJourney('guided')}>Start guidance <Navigation size={18} /></button><button className="secondary-action route-discovery-action" onClick={() => startJourney('discover')}><MapIcon size={17}/><span><strong>Track my own route</strong><small>Walk another path; GPS compares its shape</small></span></button></div>}
        </div>}

        {stage === 'active' && <div className="journey-step active-journey">
          <span className="step-kicker live"><i /> {journeyIntent === 'discover' ? 'RECORDING YOUR ROUTE' : 'LIVE GUIDANCE'}</span><h1>{journeyIntent === 'discover' ? 'Walk the route you know.' : selected.name}</h1><div className={`journey-tracking-card is-${trackingState}`}><Navigation/><div><span>GPS JOURNEY TRACE</span><strong>{trackingState === 'tracking' ? `${journeyTrace.length} location points captured` : trackingState === 'starting' ? 'Finding your location…' : trackingState === 'outside-area' ? 'Outside the pilot route area' : trackingState === 'unavailable' ? 'Location is unavailable' : 'Ready to track'}</strong><small>{trackingState === 'tracking' ? 'Your actual path appears on the map as you move.' : trackingState === 'outside-area' ? 'Tracking begins when you reach the Cremorne pilot area.' : trackingState === 'unavailable' ? 'The planned route remains available without GPS.' : 'Allow location to record the path you actually walk.'}</small></div></div><div className="live-expectation"><Clock3/><span><small>EXPECTED</small><strong>{selected.durationMin} min · arrival by {parsedBrief.deadlineLabel}</strong></span></div><div className="next-turn"><Navigation /><div><span>NEXT</span><strong>{journeyIntent === 'discover' ? 'Take your own path to the destination' : 'Follow the highlighted pedestrian route'}</strong><small>{journeyIntent === 'discover' ? 'If it is genuinely better, you can share it for CDH review.' : 'GPS records any path change automatically.'}</small></div></div><button className="primary-action" onClick={finishJourney}>I’ve arrived <Check size={18} /></button>
        </div>}

        {stage === 'feedback' && <div className="journey-step arrival-card">
          <div className="arrival-icon"><Check /></div><span className="step-kicker">ARRIVED</span><h1>How did this journey feel?</h1><div className="captured-path"><TracePreview points={journeyTrace} planned={selected.coordinates}/><span><small>{journeyTrace.length > 1 ? 'WALKED PATH' : 'PLANNED PATH'}</small><strong>{journeyTrace.length > 1 ? 'Recorded automatically by GPS' : 'GPS path is captured during the field journey'}</strong></span></div><div className="arrival-metrics"><div><strong>{Math.max(1, Math.round(elapsedSeconds / 60))}</strong><span>journey time</span></div><div><strong>{selected.durationMin}</strong><span>expected</span></div><div><strong>{selected.canopyAdjacentPct}%</strong><span>canopy proxy</span></div></div><div className="measurement-note"><Activity/><span><strong>Path and journey time are captured automatically</strong><small>The field pilot combines that trace with crossing and direct-sun observations. Mia only reports how the journey felt.</small></span></div><strong className="feedback-question">Compared with what you expected?</strong><div className="feedback-row">{(['better', 'same', 'worse'] as const).map((value) => <button key={value} onClick={() => void recordFeedback(value)}>{value === 'better' ? 'Better' : value === 'same' ? 'Same' : 'Worse'}</button>)}</div>
        </div>}

        {stage === 'saved' && <div className="journey-step saved-card">
          <div className="arrival-icon"><BrainCircuit /></div><span className="step-kicker">PERSONAL MEMORY UPDATED</span><h1>{canShareNewPath ? 'You found another way.' : 'Your next journey starts smarter.'}</h1><div className="feedback-saved"><Check/><span>{canShareNewPath ? 'This path differs from the routes Cremorne currently knows.' : 'This outcome can shape your next similar journey.'}</span></div>
          {canShareNewPath && shareStatus === 'idle' && <div className="share-path-card"><TracePreview points={journeyTrace} planned={selected.coordinates}/><div><strong>Share this better path?</strong><span>GPS found a route shape that differs from the selected route. Share it as a Candidate Route.</span></div><button className="primary-action" onClick={() => void chooseTraceSharing(true)}>Share candidate path <ArrowRight size={17}/></button><button className="secondary-action" onClick={() => void chooseTraceSharing(false)}>Keep private</button></div>}
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
        <CremorneMap routes={stage === 'setup' ? [] : routes} selectedId={selected?.id} onSelect={(id) => { if (stage !== 'setup') setSelectedId(id) }} showTrees={stage !== 'setup'} showFlow={stage === 'results' || stage === 'active'} journeyTrace={journeyTrace} />
        {stage !== 'setup' && <div className="map-context"><span><Sun size={15}/>{timeOfUseWeather.available ? `${parsedBrief.deadlineLabel} arrival · UV ${timeOfUseWeather.uvIndex.toFixed(1)}` : `${parsedBrief.deadlineLabel} arrival`}</span><span><Users size={15} /> {workers.toLocaleString()} station arrivals</span>{(memory.length > 0 || personalOutcomes.length > 0) && <span className="memory-on"><BrainCircuit size={15} /> Previous outcome applied</span>}</div>}
        {stage === 'active' && <div className="map-active-banner"><Navigation size={16} /><span>Journey in progress</span></div>}
        {stage === 'results' && selected && <aside className="route-summary-panel"><span className="step-kicker">{selected.recommended ? 'BEST FIT' : 'ALTERNATIVE'}</span><h2>{selected.name}</h2><div className="route-summary-metrics"><div><strong>{selected.durationMin}</strong><span>min walk</span></div><div><strong>{selected.canopyAdjacentPct}%</strong><span>canopy-adjacent</span></div><div><strong>{parsedBrief.deadlineLabel}</strong><span>arrive by</span></div></div>{routeTradeoff && routeTradeoff.seconds >= 0 && routeTradeoff.canopy > 0 && <div className="route-tradeoff"><Clock3/><strong>+{routeTradeoff.seconds} sec</strong><span>for +{routeTradeoff.canopy} canopy points</span></div>}<p><strong>Why this route</strong>{selectedDecisionOption?.explanation || routeReason(selected)}</p>{selected.reasons.some((reason) => /memory/i.test(reason)) && <div className="route-memory-note"><BrainCircuit size={16}/><span>Previous local outcome applied to this match</span></div>}</aside>}
      </div>
    </section>
  )
}

function SpaceJourney({ workerMode }: { workerMode: WorkerMode }) {
  const initialBrief = workerMode === 'mia'
    ? MIA_ROOM_BRIEF
    : 'Find a 6-person hybrid room at 2pm.'
  const [brief, setBrief] = useState(initialBrief)
  const [appliedBrief, setAppliedBrief] = useState(initialBrief)
  const [hasSearched, setHasSearched] = useState(false)
  const [selectedId, setSelectedId] = useState('boardroom')
  const [bookingStage, setBookingStage] = useState<'available' | 'booked'>('available')
  const [decision, setDecision] = useState<RecommendResponse | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [, setSearchError] = useState(false)
  const [roomIssue, setRoomIssue] = useState<WorkspaceIssueKey>('temperature')
  const [issueDetail, setIssueDetail] = useState('')
  const [feedbackStatus, setFeedbackStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [roomExperiences, setRoomExperiences] = useState<RoomExperience[]>(() => loadRoomExperiences())
  const [workspaceEvidence, setWorkspaceEvidence] = useState<WorkspaceIssueRecord[]>([])
  const decisionRequest = useRef<Promise<RecommendResponse> | null>(null)
  const prefetchedBrief = useRef<string | null>(null)
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
  const softBlocker = (blocker: string) => /availab|owner|not confirmed/i.test(blocker)
  const visibleResults = results.filter((space) => space.blockers.every(softBlocker))
  const capabilityMatches = visibleResults
  const eligibleSpaces = visibleResults.filter((space) => space.eligible)
  const selected = visibleResults.find((space) => space.id === selectedId) ?? eligibleSpaces[0] ?? visibleResults[0]
  const selectedOption = decision?.options.find((option) => option.productId === selected?.id)
  const selectedComments = selected ? roomExperiences.filter((experience) => experience.roomId === selected.id) : []
  const selectedExperience = selectedComments[0]
  const selectedEvidence = selected ? workspaceEvidence.filter((issue) => issue.capacityUnitId === `workspace-${selected.id}`) : []
  const previousOpenIssue = selectedExperience?.status === 'reported' ? selectedExperience : undefined
  const seatsLeft = (space: typeof results[number]) => {
    const option = decision?.options.find((candidate) => candidate.productId === space.id)
    return Math.max(0, option?.remainingCapacity ?? space.capacity - parsedBrief.people)
  }
  const chooseSpace = (id: string) => { setSelectedId(id); setBookingStage('available'); setFeedbackStatus('idle'); setIssueDetail('') }

  useEffect(() => {
    let active = true
    getWorkspaceIssues().then((response) => { if (active) setWorkspaceEvidence(response.issues) }).catch(() => undefined)
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (workerMode !== 'mia' || brief !== MIA_ROOM_BRIEF || decisionRequest.current) return
    prefetchedBrief.current = brief
    const pending = recommendCapacity({ brief, context: currentDecisionContext({ uvIndex: 0, temperature: 0, crowding: 0, workers: 0, profileId }), useMemory: true })
    decisionRequest.current = pending
    void pending.catch(() => {
      if (decisionRequest.current === pending) {
        decisionRequest.current = null
        prefetchedBrief.current = null
      }
    })
  }, [brief, profileId, workerMode])

  const searchSpaces = () => {
    const localBrief = parseSpaceBrief(brief)
    const localMatches = findSpaces({ people: localBrief.people, durationMinutes: localBrief.durationMinutes, requireHybrid: localBrief.requireHybrid, requireAccessible: localBrief.requireAccessible, requiredEquipment: localBrief.requiredEquipment, timeLabel: localBrief.timeLabel, scope: 'shared' })
    setAppliedBrief(brief); setBookingStage('available'); setDecision(null); setSearchError(false); setHasSearched(true); setIsSearching(true)
    const instantId = (localMatches.find((space) => space.eligible) ?? localMatches.find((space) => space.blockers.every((blocker) => /availab|owner/i.test(blocker))) ?? localMatches[0])?.id ?? 'boardroom'
    setSelectedId(instantId)
    const pending = prefetchedBrief.current === brief && decisionRequest.current ? decisionRequest.current : recommendCapacity({ brief, context: currentDecisionContext({ uvIndex: 0, temperature: 0, crowding: 0, workers: 0, profileId }), useMemory: true })
    decisionRequest.current = pending
    prefetchedBrief.current = brief
    void pending.then((response) => {
      setDecision(response)
      const preferred = response.recommendation?.productId ?? response.options.find((option) => option.productId === 'boardroom')?.productId ?? response.options[0]?.productId ?? 'boardroom'
      setSelectedId((current) => current && current !== instantId ? current : preferred)
    }).catch(() => setDecision(null)).finally(() => setIsSearching(false))
  }
  const submitRoomFeedback = async () => {
    if (!selected) { setFeedbackStatus('error'); return }
    setFeedbackStatus('saving')
    setRoomExperiences(saveRoomExperience({ roomId: selected.id, roomName: selected.name, issue: roomIssue, detail: issueDetail.trim() || `${roomIssue} needs attention`, status: 'reported' }))
    try {
      const matchedDecision = decision ?? await decisionRequest.current
      const option = matchedDecision?.options.find((candidate) => candidate.productId === selected.id)
      if (!matchedDecision || !option) { setFeedbackStatus('saved'); return }
      await recordGraphOutcome({
        decisionId: matchedDecision.decisionId,
        capacityUnitId: option.id,
        demand: matchedDecision.demand,
        context: currentDecisionContext({ uvIndex: 0, temperature: 0, crowding: 0, workers: 0, profileId }),
        feedback: 'worse',
        metrics: {},
        workspaceIssues: [{ issue: roomIssue, detail: issueDetail.trim() || undefined, severity: 2 }],
      })
      getWorkspaceIssues().then((response) => setWorkspaceEvidence(response.issues)).catch(() => undefined)
      setFeedbackStatus('saved')
    } catch { setFeedbackStatus('saved') }
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
      setFeedbackStatus('idle')
    } catch { setFeedbackStatus('error') }
  }
  const availabilityUnknown = selected?.blockers.some((blocker) => /availab|owner|not confirmed/i.test(blocker)) ?? false

  return (
    <section className="space-experience">
      <aside className="space-search">
        {workerMode === 'mia' && <span className="step-kicker">MIA’S WORKSPACE NEEDS</span>}
        <h1>What space do you need?</h1>
        <p>{workerMode === 'mia' ? 'Ask for the meeting, time and the sun control Mia actually needs.' : 'Describe the meeting, time and equipment.'}</p>
        <label className="brief-composer"><span>SPACE BRIEF</span><textarea value={brief} onChange={(event) => { setBrief(event.target.value); setSearchError(false); setHasSearched(false); setDecision(null); decisionRequest.current = null; prefetchedBrief.current = null }} rows={4}/></label>
        <div className="duration-picker"><span>DURATION</span><div>{[30, 45, 60, 90].map((minutes) => <button key={minutes} className={parsedDraft.durationMinutes === minutes ? 'is-active' : ''} onClick={() => setBrief((current) => withSpaceDuration(current, minutes))}>{minutes} min</button>)}</div></div>
        <button className="primary-action space-search-action" aria-busy={isSearching} onClick={searchSpaces}>{hasSearched ? 'Update matches' : 'Find rooms'} <ArrowRight size={17}/></button>
        {hasSearched && <div className="brief-understood brief-understood--result"><span>YOUR NEED</span><div>{(decisionChips.length ? decisionChips : parsedBrief.chips).map((chip) => <b key={chip}>{chip}</b>)}</div></div>}
        {hasSearched && <>{capabilityMatches.length ? <div className="space-match-count"><strong>{capabilityMatches.length}</strong><span>room options match this brief</span></div> : <div className="honest-gap"><ShieldAlert/><div><strong>No room matches every requirement</strong><span>Change one requirement to see the next closest options.</span></div></div>}</>}
      </aside>

      <div className={`space-canvas room-plan ${!hasSearched ? 'space-canvas--empty' : ''}`}>
        {!hasSearched ? <div className="space-empty-state space-map-prompt"><Building2/><strong>Find a room in Cremorne.</strong><span>Start with who is meeting, when, and what the room must support.</span></div> : capabilityMatches.length && selected ? <><div className="capacity-address"><Building2/><span><small>80 BALMAIN STREET</small><strong>Cremorne Digital Hub</strong></span><b>{parsedBrief.timeLabel}–{bookingEnd(parsedBrief.timeLabel, parsedBrief.durationMinutes)}</b></div><span className="space-floor-label">ROOM CAPABILITY MAP</span><div className="floor-corridor">SHARED ACCESS</div>{visibleResults.map((space, index) => <button key={space.id} onClick={() => chooseSpace(space.id)} className={`room-shape room-${index + 1} ${space.eligible ? 'is-eligible' : 'needs-confirmation'} ${selected.id === space.id ? 'is-selected' : ''}`}><small>{space.eligible ? index === 0 ? 'BEST MATCH' : 'ALTERNATIVE' : index === 0 ? 'BEST CAPABILITY MATCH' : 'ALTERNATIVE'}</small><strong>{space.name.replace('CDH ', '')}</strong><em>{space.capacity} seats · {space.mode}</em><span>{seatsLeft(space)} left</span></button>)}</> : <div className="space-empty-state space-map-prompt"><ShieldAlert/><strong>No room fits the brief.</strong><span>Change one requirement to see the closest options.</span></div>}
      </div>

      <aside className={`space-confirm ${!hasSearched ? 'space-confirm--empty' : ''}`}>
        {!hasSearched || !selected ? <div className="space-empty-detail"><CircleGauge/><strong>One clear match at a time</strong><span>Capacity, access, equipment, availability and previous user comments will appear here.</span></div> : <>
          <span className="step-kicker">{selected.eligible ? visibleResults[0]?.id === selected.id ? 'BEST MATCH' : 'ALTERNATIVE' : visibleResults[0]?.id === selected.id ? 'BEST CAPABILITY MATCH' : 'ALTERNATIVE'}</span>
          <h2>{selected.name}</h2>
          <div className="space-access-class">{(selectedOption?.accessClass ?? selected.accessClass) === 'internal' ? 'INTERNAL SPACE' : 'SHARED SPACE'}</div>
          <div className="capacity-number"><strong>{seatsLeft(selected)}</strong><span>seats left<br/>after this {parsedBrief.people}-person booking</span></div>
          <div className="facility-list">{selected.facilities.map((facility) => <span key={facility}>{facility}</span>)}</div>
          <div className="room-fit-summary"><strong>What matches</strong><span>Fits {parsedBrief.people} people</span>{parsedBrief.requireHybrid && <span>Hybrid capability</span>}<span>{selected.accessible ? 'Accessible venue' : 'Accessibility not confirmed'}</span>{parsedBrief.requiredEquipment.map((equipment) => <span key={equipment} className={selected.facilities.includes(equipment) ? '' : 'needs-check'}>{equipment}: {selected.facilities.includes(equipment) ? 'confirmed' : 'confirm with venue'}</span>)}</div>
          {(previousOpenIssue || selectedEvidence.length > 0) && <div className="room-memory-card"><BrainCircuit/><div><span>RECENT WORKER EXPERIENCE</span><strong>{previousOpenIssue ? `${previousOpenIssue.issue}: ${previousOpenIssue.detail}` : `${selectedEvidence[0].independentReporterCount} people reported ${selectedEvidence[0].issue}`}</strong><small>{selectedEvidence[0]?.status === 'validated' ? 'This now affects matching for relevant needs.' : 'CDH can review a repeated pattern before it changes shared guidance.'}</small></div></div>}
          {selected.eligible && bookingStage === 'available' && <><div className="booking-time"><Clock3 /><span><small>AVAILABLE WINDOW</small><strong>{selectedOption?.availableFrom ?? parsedBrief.timeLabel}–{selectedOption?.availableUntil ?? bookingEnd(parsedBrief.timeLabel, parsedBrief.durationMinutes)}</strong></span></div><button className="primary-action" onClick={() => setBookingStage('booked')}>Book {parsedBrief.durationMinutes} minutes <Check size={18} /></button></>}
          {selected.eligible && bookingStage === 'booked' && <div className="booking-flow booking-complete"><div className="arrival-icon"><Check/></div><span className="step-kicker">ROOM BOOKED</span><strong>{selected.name}</strong><p>{parsedBrief.timeLabel}–{bookingEnd(parsedBrief.timeLabel, parsedBrief.durationMinutes)} · {parsedBrief.people}-person meeting</p></div>}
          {!selected.eligible && availabilityUnknown && <div className="honest-gap owner-availability-gap"><Clock3/><div><strong>Owner confirmation</strong><span>Confirm the {parsedBrief.timeLabel}–{bookingEnd(parsedBrief.timeLabel, parsedBrief.durationMinutes)} window{parsedBrief.requiredEquipment.length ? ' and requested room features' : ''} with CDH.</span><a href="https://www.cremornedigitalhub.com.au/events/" target="_blank" rel="noreferrer">Request confirmation <ArrowRight size={13}/></a></div></div>}
          {!selected.eligible && !availabilityUnknown && <div className="honest-gap"><ShieldAlert /><div><strong>Filtered by your need</strong><span>{selected.blockers.join(' · ')}</span></div></div>}
          {previousOpenIssue && decision && <div className="room-follow-up"><span>FOLLOW UP ON THE LAST REPORT</span><strong>Is the {previousOpenIssue.issue} issue resolved?</strong><div><button onClick={() => { setRoomIssue(previousOpenIssue.issue); setIssueDetail('The issue is still present.'); setFeedbackStatus('idle') }}>Report again</button><button disabled={feedbackStatus === 'saving'} onClick={() => void confirmIssueResolved()}>Confirm fixed</button></div></div>}
          <section className="room-comments"><div className="room-comments__heading"><MessageSquare size={16}/><span><strong>User comments</strong><small>{selectedComments.length ? `${selectedComments.length} saved experience${selectedComments.length === 1 ? '' : 's'}` : 'Help the next person know what to expect'}</small></span></div>{selectedComments.slice(0, 2).map((comment) => <article key={comment.id}><b>{comment.issue}</b><span>{comment.detail}</span></article>)}<div className="issue-grid">{(['temperature', 'equipment', 'blinds', 'acoustics', 'accessibility'] as WorkspaceIssueKey[]).map((issue) => <button key={issue} className={roomIssue === issue ? 'is-active' : ''} onClick={() => setRoomIssue(issue)}>{issue}</button>)}</div><textarea aria-label="Room experience comment" value={issueDetail} onChange={(event) => setIssueDetail(event.target.value)} placeholder="What should the next worker know?" rows={2}/>{feedbackStatus === 'error' && <small className="comment-status is-error">Could not save yet. Try once more.</small>}{feedbackStatus === 'saved' && <small className="comment-status is-saved"><Check size={12}/> Experience saved for your next match.</small>}<button className="room-report-action" disabled={feedbackStatus === 'saving'} onClick={() => void submitRoomFeedback()}>{feedbackStatus === 'saving' ? 'Saving…' : 'Share room experience'} <ArrowRight size={15}/></button></section>
        </>}
      </aside>
    </section>
  )
}

function OperatorExperience({ weather, memory, onSeeWorker }: {
  weather: { uvIndex: number }
  memory: MemoryRule[]
  setMemory: (memory: MemoryRule[]) => void
  onSeeWorker: () => void
}) {
  const journeyOutcomes = useMemo(() => loadJourneyOutcomes(), [])
  const latestJourney = journeyOutcomes[0]
  const [issues, setIssues] = useState<WorkspaceIssueRecord[]>([])
  const [routeExceptions, setRouteExceptions] = useState<RouteExceptionRecord[]>([])
  const [candidateRoutes, setCandidateRoutes] = useState<CandidateRouteRecord[]>([])
  const [loadingIssues, setLoadingIssues] = useState(true)
  const [candidateUnderReview, setCandidateUnderReview] = useState<CandidateRouteRecord | null>(null)
  const [candidateReview, setCandidateReview] = useState({ durationMinutes: '', shadePercent: '', safeCapacity: '', confidence: '0.7', reason: '' })
  const [candidateReviewStatus, setCandidateReviewStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const [selectedRouteId, setSelectedRouteId] = useState('route-east-richmond-3')
  const [issuesError, setIssuesError] = useState(false)
  const [reviewingIssueId, setReviewingIssueId] = useState<string | null>(null)
  const [reviewingRouteExceptionId, setReviewingRouteExceptionId] = useState<string | null>(null)
  const hotspot = productContext.hotspots[0]
  const direct = productContext.routeSets['east-richmond'][0]
  const canopy = productContext.routeSets['east-richmond'][2]
  const operatorRoutes = useMemo(() => evaluateProductRoutes({ destination: 'east-richmond', need: 'lower-uv', uvIndex: weather.uvIndex, workers: demandAtTime('east-richmond', '16:10'), memoryRules: memory, personalOutcomes: journeyOutcomes }), [journeyOutcomes, memory, weather.uvIndex])
  const refreshIssues = async () => {
    setLoadingIssues(true); setIssuesError(false)
    try { setIssues((await getWorkspaceIssues()).issues) } catch { setIssuesError(true) }
    finally { setLoadingIssues(false) }
  }
  useEffect(() => {
    let active = true
    Promise.all([getWorkspaceIssues(), getCandidateRoutes(), getRouteExceptions()]).then(([issueResponse, routeResponse, exceptionResponse]) => {
      if (active) {
        setIssues(issueResponse.issues)
        setCandidateRoutes(routeResponse.candidates)
        setRouteExceptions(exceptionResponse.exceptions)
      }
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
  const rememberRouteException = async (exception: RouteExceptionRecord) => {
    setReviewingRouteExceptionId(exception.id); setIssuesError(false)
    try {
      await reviewRouteException({
        exceptionId: exception.id,
        decision: 'validate',
        reason: `Repeated low-UV journeys found ${exception.capacityName} unsuitable under comparable conditions.`,
      })
      setRouteExceptions((await getRouteExceptions()).exceptions)
    } catch { setIssuesError(true) }
    finally { setReviewingRouteExceptionId(null) }
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
      <header className="operator-heading"><div><span className="step-kicker">PRECINCT OPERATIONS</span><h1>Review evidence before it changes shared guidance.</h1></div><div className="demo-context"><span><Sun size={15}/>{weather.uvIndex ? `UV ${weather.uvIndex.toFixed(1)}` : 'UV unavailable'}</span><span><Activity size={15}/>6 smart-pole locations</span></div></header>
      <section className="operator-workbench">
        <div className="operator-scene">
          <div className="scene-top"><span><Activity size={15}/>{hotspot.name}</span><span><Users size={15}/>{hotspot.surveyedPedestrianMovements.toLocaleString()} surveyed movements</span></div>
          <CremorneMap routes={operatorRoutes} selectedId={selectedRouteId} onSelect={setSelectedRouteId} showTrees showFlow candidateTraces={candidateRoutes.map((candidate) => ({ id: candidate.id, name: candidate.name, points: candidate.geometry, status: candidate.status }))} />
          <div className="scene-legend"><span><i className="a"/>Alternative A</span><span><i className="b"/>Direct B · {direct.durationMin} min</span><span><i className="c"/>Canopy C · {canopy.canopyAdjacentPct}% canopy</span></div>
        </div>
        <aside className="operator-decision">
          <span className="step-kicker">REAL-DATA PILOT</span><h2>Measure what the map cannot see.</h2>
          <div className="result-pair"><div><span>DIRECT B</span><strong>{direct.durationMin} min</strong><small>{direct.canopyAdjacentPct}% canopy-adjacent</small></div><div><span>CANOPY C</span><strong>{canopy.durationMin} min</strong><small>{canopy.canopyAdjacentPct}% canopy-adjacent</small></div></div>
          {latestJourney ? <div className="operator-observed"><span>LATEST WORKER OUTCOME</span><strong>{latestJourney.routeName} · {latestJourney.feedback}</strong><div><b>{Math.max(1, Math.round(latestJourney.elapsedSeconds / 60))} min journey</b>{latestJourney.crossingWaitMinutes != null && <b>{latestJourney.crossingWaitMinutes} min crossing wait</b>}{latestJourney.directSunMinutes != null && <b>{latestJourney.directSunMinutes} min direct sun</b>}</div></div> : <div className="brief-understood"><span>FIELD OUTCOME</span><div><b>journey time</b><b>crossing wait</b><b>direct-sun minutes</b><b>worker experience</b></div></div>}
          <div className="operator-signal operator-signal--compact"><strong>{routeExceptions.filter((exception) => exception.status === 'candidate').length}</strong><span>route boundaries ready to remember</span></div>
          <div className="operator-issue-list">{loadingIssues ? <small>Loading route outcomes…</small> : routeExceptions.length === 0 ? <small>Similar route outcomes will appear here.</small> : routeExceptions.slice(0, 2).map((exception) => <div key={exception.id}><span><strong>{exception.capacityName}</strong><small>{exception.independentReporterCount} similar low-UV journeys · {exception.status}</small></span>{exception.status === 'candidate' && <button disabled={reviewingRouteExceptionId === exception.id} onClick={() => void rememberRouteException(exception)}>{reviewingRouteExceptionId === exception.id ? 'Saving…' : 'Remember'}</button>}</div>)}</div>
          <div className="operator-signal operator-signal--compact"><strong>{issues.filter((issue) => issue.status === 'candidate').length}</strong><span>room issues ready for CDH review</span></div>
          <div className="operator-issue-list">{issuesError ? <RetryNotice title="Room evidence unavailable" message="The current review list could not be loaded or updated." onRetry={() => void refreshIssues()} retrying={loadingIssues}/> : loadingIssues ? <small>Loading room evidence…</small> : issues.length === 0 ? <small>No repeated room issue has reached the review threshold.</small> : issues.slice(0, 3).map((issue) => <div key={issue.id}><span><strong>{issue.capacityName}</strong><small>{issue.issue} · {issue.independentReporterCount} independent reports · {issue.status}</small></span>{issue.status === 'candidate' && <button disabled={reviewingIssueId === issue.id} onClick={() => void validateIssue(issue)}>{reviewingIssueId === issue.id ? 'Validating…' : 'Validate'}</button>}</div>)}</div>
          <div className="operator-signal operator-signal--compact"><strong>{candidateRoutes.filter((route) => route.status === 'candidate').length}</strong><span>worker-proposed routes awaiting review</span></div>
          <div className="operator-issue-list">{loadingIssues ? <small>Loading proposed routes…</small> : candidateRoutes.length === 0 ? <small>No proposed route is waiting for review.</small> : candidateRoutes.slice(0, 2).map((candidate) => <div key={candidate.id}><span><strong>{candidate.name}</strong><small>{candidate.geometry.length} points · {candidate.status}</small></span>{candidate.status === 'candidate' && <button onClick={() => openCandidateReview(candidate)}>Review</button>}</div>)}</div>
          <button className="primary-action" onClick={onSeeWorker}>Open the worker journey <ArrowRight size={18}/></button>
        </aside>
      </section>
      <section className="operator-live-summary" aria-label="Current evidence queue">
        <div><strong>{journeyOutcomes.length}</strong><span>worker outcomes on this device</span></div>
        <div><strong>{routeExceptions.filter((item) => item.status === 'candidate').length}</strong><span>route patterns ready for review</span></div>
        <div><strong>{issues.filter((item) => item.status === 'candidate').length}</strong><span>room issues ready for review</span></div>
        <div><strong>{candidateRoutes.filter((item) => item.status === 'candidate').length}</strong><span>new paths awaiting field validation</span></div>
      </section>
      {candidateUnderReview && <div className="feedback-modal" role="dialog" aria-modal="true" aria-labelledby="candidate-review-title"><div className="feedback-modal__card candidate-review-card"><button className="feedback-modal__close" aria-label="Close candidate route review" onClick={() => setCandidateUnderReview(null)}><X size={18}/></button><span className="step-kicker">FIELD REVIEW</span><h2 id="candidate-review-title">Validate {candidateUnderReview.name}</h2><p>A proposed path remains private to the review queue until measured evidence supports wider guidance.</p><div className="candidate-evidence-grid"><label><span>JOURNEY MINUTES</span><input inputMode="decimal" value={candidateReview.durationMinutes} onChange={(event) => setCandidateReview((current) => ({ ...current, durationMinutes: event.target.value }))}/></label><label><span>CANOPY %</span><input inputMode="decimal" value={candidateReview.shadePercent} onChange={(event) => setCandidateReview((current) => ({ ...current, shadePercent: event.target.value }))}/></label><label><span>SAFE CAPACITY</span><input inputMode="numeric" value={candidateReview.safeCapacity} onChange={(event) => setCandidateReview((current) => ({ ...current, safeCapacity: event.target.value }))}/></label><label><span>CONFIDENCE 0–1</span><input inputMode="decimal" value={candidateReview.confidence} onChange={(event) => setCandidateReview((current) => ({ ...current, confidence: event.target.value }))}/></label></div><label className="candidate-review-reason"><span>REVIEW NOTE</span><textarea rows={2} value={candidateReview.reason} onChange={(event) => setCandidateReview((current) => ({ ...current, reason: event.target.value }))} placeholder="What did the field check confirm?"/></label>{candidateReviewStatus === 'error' && <div className="honest-gap"><ShieldAlert/><div><strong>Complete the field evidence</strong><span>Validation needs measured time, canopy, capacity, confidence and a review note.</span></div></div>}<div className="candidate-review-actions"><button disabled={candidateReviewStatus === 'saving'} className="secondary-action" onClick={() => void submitCandidateReview('reject')}>Reject</button><button disabled={candidateReviewStatus === 'saving'} className="primary-action" onClick={() => void submitCandidateReview('validate')}>{candidateReviewStatus === 'saving' ? 'Saving…' : 'Validate route'} <Check size={17}/></button></div></div></div>}
    </main>
  )
}

export default function App() {
  return window.location.pathname.startsWith(PATHS.product) ? <ProductApp /> : <Landing />
}
