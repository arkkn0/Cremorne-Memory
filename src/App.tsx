import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowLeft, ArrowRight, BrainCircuit, Building2, Check,
  CircleGauge, Clock3, FlaskConical, Home, Map as MapIcon,
  Navigation, Play, RefreshCw, ShieldAlert, Sparkles, Sun, ThermometerSun, Trees, Users,
} from 'lucide-react'
import CremorneMap from './CremorneMap'
import { currentDecisionContext, getWorkspaceIssues, recommendCapacity, recordGraphOutcome, reviewWorkspaceIssue } from './api'
import type { RecommendResponse, WorkspaceIssueKey, WorkspaceIssueRecord } from './api-contracts'
import { loadJourneyOutcomes, loadMemory, saveJourneyOutcome } from './memory'
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

const PATHS = { landing: '/', product: '/app' }
const MIA_PROFILE_ID = 'mia-demo'
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
  const [weather, setWeather] = useState({ temperature: 0, uvIndex: 0, source: 'Live feed unavailable' })
  useEffect(() => {
    const controller = new AbortController()
    fetch('https://api.open-meteo.com/v1/forecast?latitude=-37.83&longitude=144.995&hourly=temperature_2m,uv_index&forecast_days=2&timezone=Australia%2FSydney', { signal: controller.signal })
      .then((response) => response.json()).then((data) => {
        const now = new Date()
        const localHour = `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:00`
        const index = data.hourly?.time?.findIndex((value: string) => value === localHour) ?? -1
        if (index >= 0) setWeather({ temperature: Number(data.hourly.temperature_2m[index]), uvIndex: Number(data.hourly.uv_index[index]), source: 'Current Cremorne forecast · Open-Meteo' })
      }).catch(() => undefined)
    return () => controller.abort()
  }, [])
  return weather
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
      {role === 'demo' && <GuidedDemo setMemory={setMemory} onOpenWorker={() => { setWorkerMode('mia'); setRole('worker'); setTask('route') }} />}
      {role === 'worker' && <WorkerExperience task={task} setTask={setTask} weather={weather} memory={memory} workerMode={workerMode} />}
      {role === 'operator' && <OperatorExperience weather={weather} memory={memory} setMemory={setMemory} onSeeWorker={() => { setWorkerMode('mia'); setRole('worker'); setTask('route') }} />}
    </div>
  )
}

function GuidedDemo({ onOpenWorker }: {
  setMemory: (memory: MemoryRule[]) => void
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
        <div><span>30-SECOND LIVE PROOF</span><h1>One real hotspot. Two real routes. One measurable pilot.</h1></div>
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
          {stage === 'remembered' && <div className="memory-retrieved"><BrainCircuit/><span>PILOT MEMORY<strong>Outcome + need + context</strong></span></div>}
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
            <span className="step-kicker">4 · MEASURE, THEN REMEMBER</span>
            <h2>Evidence changes the next match.</h2>
            <div className="remembered-choice blocked"><Activity/><span><small>FIELD OUTCOME</small><strong>Time · sun minutes · crossing wait · feedback</strong></span></div>
            <div className="remembered-choice eligible"><Check/><span><small>MEMORY UNIT</small><strong>Context · need · outcome · boundary</strong></span></div>
            <div className="remembered-rule"><span>ONLY AFTER</span><strong>repeated evidence or a controlled CDH pilot</strong><span>THEN</span><strong>reweight the next comparable decision</strong></div>
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
  weather: { temperature: number; uvIndex: number; source: string }
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
  return <svg className="trace-preview" viewBox="0 0 160 60" role="img" aria-label="The path walked on this journey"><path d={path || 'M 12 44 C 48 18 92 46 148 15'} /><circle cx="12" cy="44" r="4"/><circle cx="148" cy="15" r="4"/></svg>
}

function RouteJourney({ weather, memory, workerMode }: { weather: { uvIndex: number }; memory: MemoryRule[]; workerMode: WorkerMode }) {
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
  const [outcomeStatus, setOutcomeStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [shareStatus, setShareStatus] = useState<'idle' | 'sharing' | 'shared' | 'kept-private' | 'error'>('idle')
  const [shareChoice, setShareChoice] = useState(false)
  const watchId = useRef<number | null>(null)
  const parsedBrief = useMemo(() => parseRouteBrief(brief), [brief])
  const workers = demandAtTime(parsedBrief.destination, parsedBrief.departure)
  const localRoutes = useMemo(() => evaluateProductRoutes({ destination: parsedBrief.destination, need: parsedBrief.need, strength: parsedBrief.strength, flexibilityMin: parsedBrief.flexibilityMin, uvIndex: weather.uvIndex, workers, memoryRules: memory, personalOutcomes }), [parsedBrief, weather.uvIndex, workers, memory, personalOutcomes])
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

  useEffect(() => {
    if (stage !== 'active' || !startedAt) return
    const timer = window.setInterval(() => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000))), 1000)
    return () => window.clearInterval(timer)
  }, [stage, startedAt])

  useEffect(() => () => {
    if (watchId.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current)
  }, [])

  const resetForInput = () => { setStage('setup'); setSelectedId(undefined); setStartedAt(undefined); setElapsedSeconds(0); setDecision(null); setClarification(null); setRouteError(false); setJourneyTrace([]); setFeedback(null); setOutcomeStatus('idle'); setShareStatus('idle') }
  const findRoutes = async () => {
    setIsFinding(true); setClarification(null); setRouteError(false)
    try {
      const response = await recommendCapacity({
        brief,
        context: currentDecisionContext({ uvIndex: weather.uvIndex, crowding: 0, workers, profileId: workerMode === 'mia' ? MIA_PROFILE_ID : undefined }),
        useMemory: true,
      })
      setDecision(response)
      if (response.clarification) { setClarification(response.clarification); return }
      const preferred = response.recommendation?.productId ?? response.options.find((option) => option.eligible)?.productId
      setSelectedId(preferred)
      setStage('results')
    } catch {
      setDecision(null)
      setSelectedId(localRoutes.find((route) => route.eligible)?.id)
      setRouteError(true)
      setStage('results')
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
    if (!decision) throw new Error('A graph-backed decision is required to store this outcome.')
    const graphOption = decision.options.find((option) => option.productId === selected.id)
    if (!graphOption) throw new Error('The selected option was not found in the graph-backed decision.')
    return recordGraphOutcome({
      decisionId: decision.decisionId,
      capacityUnitId: graphOption.id,
      demand: decision.demand,
      context: currentDecisionContext({ uvIndex: weather.uvIndex, crowding: 0, workers, profileId: workerMode === 'mia' ? MIA_PROFILE_ID : undefined }),
      feedback: value,
      metrics: { elapsedSeconds, predictedMinutes: selected.durationMin, exposureIndex: selected.exposureIndex },
      journeyTrace: shareTrace ? journeyTrace : undefined,
      shareTrace,
      candidateRouteName: `Worker-discovered path to ${decision.resolvedDestination?.name ?? parsedBrief.destination}`,
    })
  }
  const syncOutcome = async (value: 'better' | 'same' | 'worse') => {
    setOutcomeStatus('saving')
    try {
      await persistOutcome(value, false)
      setOutcomeStatus('saved')
    } catch {
      setOutcomeStatus('error')
    }
  }
  const recordFeedback = async (value: 'better' | 'same' | 'worse') => {
    setFeedback(value)
    setPersonalOutcomes(saveJourneyOutcome({ routeId: selected.id, routeName: selected.name, completedAt: new Date().toISOString(), elapsedSeconds, predictedMinutes: selected.durationMin, exposureIndex: selected.exposureIndex, feedback: value }))
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
        <JourneyProgress stage={stage} />
        {stage === 'setup' && <div className="journey-step">
          {workerMode === 'mia' && <span className="step-kicker">MIA · ALBINISM + PHOTOSENSITIVITY</span>}<h1>What journey do you need?</h1><p>{workerMode === 'mia' ? 'Travel time, canopy evidence and her low-UV requirement shape Mia’s options.' : 'Describe it in your own words.'}</p>
          <label className="brief-composer"><span>JOURNEY BRIEF</span><textarea value={brief} onChange={(event) => { setBrief(event.target.value); resetForInput() }} rows={4}/></label>
          <div className="brief-understood"><span>UNDERSTOOD</span><div>{parsedBrief.chips.map((chip) => <b key={chip}>{chip}</b>)}</div></div>
          {clarification && <div className="honest-gap"><ShieldAlert/><div><strong>Which destination?</strong><span>{clarification}</span></div></div>}
          <button className="primary-action" disabled={isFinding} onClick={findRoutes}>{isFinding ? 'Understanding your journey…' : 'Find guided actions'} <ArrowRight size={18} /></button>
        </div>}

        {stage === 'results' && <div className="journey-step">
          <button className="back-action" onClick={() => setStage('setup')}><ArrowLeft size={15} /> Change brief</button><h1>{noEligible ? 'No eligible action yet.' : 'Choose an action.'}</h1><p>{noEligible ? 'A required constraint cannot yet be verified.' : `${routes.filter((route) => route.eligible).length} actions fit your brief`}</p>
          {routeError && <RetryNotice title="Live matching unavailable" message="Showing local route evidence for now. Retry to include the Capacity Graph and Memory." onRetry={() => void findRoutes()} retrying={isFinding}/>}
          {noEligible ? <div className="honest-gap"><ShieldAlert /><div><strong>Required evidence unavailable</strong><span>{routes[0]?.reasons[0]}</span></div></div> : <div className="choice-list">{routes.map((route) => <button key={route.id} disabled={!route.eligible} onClick={() => setSelectedId(route.id)} className={`${selected.id === route.id ? 'is-selected' : ''} ${!route.eligible ? 'is-blocked' : ''}`}><i /><div><span>{route.recommended ? 'BEST FIT' : route.eligible ? 'ALTERNATIVE' : 'NOT ELIGIBLE'}</span><strong>{route.name}</strong><small>{route.eligible ? `${route.durationMin} min walk · ${route.canopyAdjacentPct}% canopy-adjacent` : route.reasons[0]}</small>{selected.id === route.id && route.eligible && <ul className="route-reasons">{route.reasons.slice(0, 3).map((reason) => <li key={reason}><Check size={12}/>{reason}</li>)}</ul>}</div>{selected.id === route.id && <Check size={17} />}</button> )}</div>}
          {!noEligible && <button className="primary-action" onClick={startJourney}>Start live guidance <Navigation size={18} /></button>}
        </div>}

        {stage === 'active' && <div className="journey-step active-journey">
          <span className="step-kicker live"><i /> LIVE GUIDANCE</span><h1>{selected.name}</h1><div className="journey-live-progress"><div><strong>On track</strong></div><div className="journey-live-progress__track" role="progressbar" aria-label="Estimated journey progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(journeyProgress)}><i style={{ width: `${journeyProgress}%` }} /></div></div><div className="live-expectation"><Clock3/><span><small>EXPECTED</small><strong>{selected.durationMin} min · arrival by {parsedBrief.deadlineLabel}</strong></span></div><div className="next-turn"><Navigation /><div><span>NEXT</span><strong>Follow the highlighted pedestrian route</strong><small>your GPS trace stays on this device unless you choose to share it</small></div></div><button className="primary-action" onClick={finishJourney}>I’ve arrived <Check size={18} /></button>
        </div>}

        {stage === 'feedback' && <div className="journey-step arrival-card">
          <div className="arrival-icon"><Check /></div><span className="step-kicker">ARRIVED</span><h1>How did this journey feel?</h1><div className="captured-path"><TracePreview points={journeyTrace}/><span><small>YOUR JOURNEY</small><strong>{journeyTrace.length > 1 ? 'GPS path captured' : 'No GPS trace captured'}</strong></span></div><div className="arrival-metrics"><div><strong>{Math.max(1, Math.round(elapsedSeconds / 60))}</strong><span>minutes observed</span></div><div><strong>{selected.durationMin}</strong><span>minutes expected</span></div><div><strong>{selected.canopyAdjacentPct}%</strong><span>canopy-adjacent geometry</span></div></div><div className="feedback-row">{(['better', 'same', 'worse'] as const).map((value) => <button key={value} onClick={() => void recordFeedback(value)}>{value === 'better' ? 'Better' : value === 'same' ? 'Same' : 'Worse'}</button>)}</div>
        </div>}

        {stage === 'saved' && <div className="journey-step saved-card">
          <div className="arrival-icon"><BrainCircuit /></div><span className="step-kicker">PERSONAL MEMORY UPDATED</span><h1>{canShareNewPath ? 'You found another way.' : 'Your next journey starts smarter.'}</h1><div className="feedback-saved"><Check/><span>{canShareNewPath ? 'This path differs from the routes Cremorne currently knows.' : 'This outcome can shape your next similar journey.'}</span></div>
          {canShareNewPath && shareStatus === 'idle' && <div className="share-path-card"><TracePreview points={journeyTrace}/><div><strong>Share this path with Cremorne?</strong><span>It becomes a candidate path for CDH to validate.</span></div><button className="primary-action" onClick={() => void chooseTraceSharing(true)}>Share path <ArrowRight size={17}/></button><button className="secondary-action" onClick={() => void chooseTraceSharing(false)}>Keep private</button></div>}
          {shareStatus === 'sharing' && <div className="feedback-saved"><Activity/><span>Adding the path to the Capacity Graph…</span></div>}
          {shareStatus === 'shared' && <div className="candidate-saved"><Check/><span><strong>Candidate path added</strong><small>CDH can compare it before wider guidance.</small></span></div>}
          {shareStatus === 'kept-private' && canShareNewPath && <div className="feedback-saved"><Check/><span>Only your personal outcome was retained.</span></div>}
          {!canShareNewPath && outcomeStatus === 'saving' && <div className="feedback-saved"><Activity/><span>Syncing this outcome with Memory…</span></div>}
          {!canShareNewPath && outcomeStatus === 'error' && feedback && <RetryNotice title="Memory sync failed" message="The outcome remains on this device. Retry when the connection is available." onRetry={() => void syncOutcome(feedback)}/>}
          {shareStatus === 'error' && <RetryNotice title={shareChoice ? 'Path not shared yet' : 'Private outcome not synced'} message="Your personal outcome remains on this device." onRetry={() => void chooseTraceSharing(shareChoice)}/>}
          {(!canShareNewPath || shareStatus !== 'idle') && shareStatus !== 'sharing' && <button className="primary-action" onClick={resetForInput}>Plan another journey <ArrowRight size={18} /></button>}
        </div>}
      </aside>

      <div className="journey-map">
        <CremorneMap routes={routes} selectedId={selected?.id} onSelect={(id) => { setSelectedId(id); if (stage === 'setup') setStage('results') }} showTrees journeyProgress={stage === 'active' ? journeyProgress / 100 : undefined} journeyTrace={journeyTrace} />
        <div className="map-context"><span><Trees size={15} /> Vicmap canopy</span><span><Users size={15} /> {workers.toLocaleString()} station entries · published time band</span>{memory.length > 0 && <span className="memory-on"><BrainCircuit size={15} /> local Memory available</span>}</div>
        {stage === 'active' && <div className="map-active-banner"><Navigation size={16} /><span>Journey in progress</span></div>}
      </div>
    </section>
  )
}

function SpaceJourney({ workerMode }: { workerMode: WorkerMode }) {
  const initialBrief = workerMode === 'mia'
    ? 'Find a 4-person hybrid room at 2pm with adjustable blinds.'
    : 'Find a 6-person hybrid room at 2pm.'
  const [brief, setBrief] = useState(initialBrief)
  const [appliedBrief, setAppliedBrief] = useState(initialBrief)
  const [selectedId, setSelectedId] = useState('boardroom')
  const [bookingStage, setBookingStage] = useState<'available' | 'booked'>('available')
  const [decision, setDecision] = useState<RecommendResponse | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [roomIssue, setRoomIssue] = useState<WorkspaceIssueKey>('temperature')
  const [issueDetail, setIssueDetail] = useState('')
  const [feedbackStatus, setFeedbackStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const profileId = useMemo(() => workerMode === 'mia' ? MIA_PROFILE_ID : browserProfileId(), [workerMode])
  const parsedDraft = useMemo(() => parseSpaceBrief(brief), [brief])
  const parsedBrief = useMemo(() => parseSpaceBrief(appliedBrief), [appliedBrief])
  const results = useMemo(() => {
    const local = findSpaces({ people: parsedBrief.people, durationMinutes: parsedBrief.durationMinutes, requireHybrid: parsedBrief.requireHybrid, requireAccessible: parsedBrief.requireAccessible, requiredEquipment: parsedBrief.requiredEquipment, timeLabel: parsedBrief.timeLabel, scope: 'shared' })
    if (!decision?.options.length) return local
    return local.flatMap((space) => {
      const option = decision.options.find((candidate) => candidate.productId === space.id)
      if (!option) return []
      return [{ ...space, eligible: option.eligible, blockers: option.eligible ? [] : option.reasons }]
    }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.capacity - b.capacity)
  }, [decision, parsedBrief])
  const capabilityMatches = results.filter((space) => space.blockers.every((blocker) => /availab|owner/i.test(blocker)))
  const eligibleSpaces = results.filter((space) => space.eligible)
  const selected = results.find((space) => space.id === selectedId) ?? capabilityMatches[0] ?? eligibleSpaces[0] ?? results[0]
  const selectedOption = decision?.options.find((option) => option.productId === selected?.id)
  const chooseSpace = (id: string) => { setSelectedId(id); setBookingStage('available'); setFeedbackStatus('idle') }
  const searchSpaces = async () => {
    setAppliedBrief(brief); setBookingStage('available'); setIsSearching(true); setSearchError(false)
    try {
      const response = await recommendCapacity({
        brief,
        context: currentDecisionContext({ uvIndex: 0, temperature: 0, crowding: 0, workers: 0, profileId }),
        useMemory: true,
      })
      setDecision(response)
      setSelectedId(response.recommendation?.productId ?? response.options.find((option) => option.productId === 'boardroom')?.productId ?? response.options[0]?.productId ?? 'boardroom')
    } catch { setDecision(null); setSearchError(true) }
    finally { setIsSearching(false) }
  }
  const submitRoomFeedback = async () => {
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
      setFeedbackStatus('saved')
    } catch { setFeedbackStatus('error') }
  }
  const availabilityUnknown = selected.blockers.some((blocker) => /availab|owner/i.test(blocker))

  return (
    <section className="space-experience">
      <aside className="space-search">{workerMode === 'mia' && <span className="step-kicker">MIA’S WORKSPACE NEEDS</span>}<h1>What space do you need?</h1><p>{workerMode === 'mia' ? 'Mia can require verified sun control as part of the match.' : 'Describe the meeting, time and equipment.'}</p><label className="brief-composer"><span>SPACE BRIEF</span><textarea value={brief} onChange={(event) => { setBrief(event.target.value); setSearchError(false) }} rows={4}/></label><div className="duration-picker"><span>DURATION</span><div>{[30, 45, 60, 90].map((minutes) => <button key={minutes} className={parsedDraft.durationMinutes === minutes ? 'is-active' : ''} onClick={() => setBrief((current) => withSpaceDuration(current, minutes))}>{minutes} min</button>)}</div></div><div className="brief-understood"><span>UNDERSTOOD</span><div>{parsedDraft.chips.map((chip) => <b key={chip}>{chip}</b>)}</div></div><button className="primary-action space-search-action" disabled={isSearching} onClick={() => void searchSpaces()}>{isSearching ? 'Matching space × time…' : 'Find spaces'} <ArrowRight size={17}/></button>{searchError && <RetryNotice title="Live room matching unavailable" message="Showing published room capabilities without live Memory. Retry to refresh the match." onRetry={() => void searchSpaces()} retrying={isSearching}/>}<div className="space-match-count"><strong>{capabilityMatches.length}</strong><span>capability matches</span></div><div className="choice-list space-choice-list">{results.map((space) => <button key={space.id} onClick={() => chooseSpace(space.id)} className={selected.id === space.id ? 'is-selected' : ''}><i/><div><span>{space.eligible ? 'AVAILABLE' : space.blockers.every((blocker) => /availab|owner/i.test(blocker)) ? 'CAPABILITY MATCH' : 'MISSING REQUIREMENT'}</span><strong>{space.name.replace('CDH ', '')}</strong><small>{space.capacity} people · {space.facilities.slice(0, 2).join(' · ')}</small></div>{selected.id === space.id && <Check size={16}/>}</button>)}</div></aside>
      <div className="space-canvas"><div className="space-floor-label">CDH · PUBLIC VENUE DATA</div>{results.map((space, index) => <button key={space.id} onClick={() => chooseSpace(space.id)} className={`room-shape room-${index + 1} ${selected.id === space.id ? 'is-selected' : ''} ${space.eligible ? 'is-eligible' : 'is-blocked'}`}><Building2 /><strong>{space.name.replace('CDH ', '')}</strong><span>{space.capacity} seats</span></button>)}<div className="floor-corridor">OWNER AVAILABILITY FEED</div></div>
      <aside className="space-confirm"><span className="step-kicker">{selected.eligible ? 'ELIGIBLE SPACE' : availabilityUnknown ? 'CAPABILITY VERIFIED' : 'NOT A MATCH'}</span><h2>{selected.name}</h2><div className="space-access-class">PUBLICLY BOOKABLE · OWNER CONFIRMS WINDOW</div><div className="capacity-number"><strong>{selected.capacity}</strong><span>people</span></div><div className="facility-list">{selected.facilities.map((facility) => <span key={facility}>{facility}</span>)}</div>{selectedOption?.explanation && <p className="space-why"><strong>Why this room</strong>{selectedOption.explanation}</p>}{selected.eligible && bookingStage === 'available' && <><div className="booking-time"><Clock3 /><span><small>OWNER FEED CONFIRMED</small><strong>{selectedOption?.availableFrom ?? parsedBrief.timeLabel}–{selectedOption?.availableUntil ?? bookingEnd(parsedBrief.timeLabel, parsedBrief.durationMinutes)}</strong></span></div><button className="primary-action" onClick={() => setBookingStage('booked')}>Book this room <Check size={18} /></button></>}{selected.eligible && bookingStage === 'booked' && <div className="booking-flow booking-complete"><div className="arrival-icon"><Check/></div><span className="step-kicker">ROOM BOOKED</span><strong>{selected.name}</strong><p>The owner feed confirmed the full meeting window.</p></div>}{!selected.eligible && availabilityUnknown && <div className="honest-gap"><Clock3/><div><strong>Capability matches your brief</strong><span>Current availability must come from the room owner before booking.</span></div></div>}{!selected.eligible && !availabilityUnknown && <div className="honest-gap"><ShieldAlert /><div><strong>Filtered by the brief</strong><span>{selected.blockers.join(' · ')}</span></div></div>}<div className="room-feedback"><strong>Used this room before?</strong><div className="facility-list">{(['temperature', 'equipment', 'blinds', 'acoustics', 'accessibility'] as WorkspaceIssueKey[]).map((issue) => <button key={issue} className={roomIssue === issue ? 'is-active' : ''} onClick={() => setRoomIssue(issue)}>{issue}</button>)}</div><input value={issueDetail} onChange={(event) => setIssueDetail(event.target.value)} placeholder="What happened? (optional)"/>{feedbackStatus !== 'error' && <button className="secondary-action" disabled={feedbackStatus === 'saving'} onClick={() => void submitRoomFeedback()}>{feedbackStatus === 'saving' ? 'Saving…' : feedbackStatus === 'saved' ? 'Saved to your Memory' : 'Share room outcome'}</button>}{feedbackStatus === 'saved' && <small>Repeated independent reports become a CDH review candidate before they affect other workers.</small>}{feedbackStatus === 'error' && <RetryNotice title="Room outcome not saved" message="Nothing was added to shared Memory. Retry when the connection is available." onRetry={() => void submitRoomFeedback()}/>}</div></aside>
    </section>
  )
}

function OperatorExperience({ weather, onSeeWorker }: {
  weather: { uvIndex: number }
  memory: MemoryRule[]
  setMemory: (memory: MemoryRule[]) => void
  onSeeWorker: () => void
}) {
  const [issues, setIssues] = useState<WorkspaceIssueRecord[]>([])
  const [loadingIssues, setLoadingIssues] = useState(true)
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
    getWorkspaceIssues().then((response) => {
      if (active) setIssues(response.issues)
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
    } catch {
      setIssuesError(true)
    } finally {
      setReviewingIssueId(null)
    }
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
          <span className="step-kicker">REAL-DATA PILOT</span><h2>Measure what public data cannot tell us.</h2>
          <div className="result-pair"><div><span>DIRECT B</span><strong>{direct.durationMin} min</strong><small>{direct.canopyAdjacentPct}% canopy-adjacent</small></div><div><span>CANOPY C</span><strong>{canopy.durationMin} min</strong><small>{canopy.canopyAdjacentPct}% canopy-adjacent</small></div></div>
          <div className="brief-understood"><span>FIELD OUTCOME</span><div><b>actual journey time</b><b>crossing wait</b><b>direct-sun minutes</b><b>Better / Same / Worse</b></div></div>
          <div className="operator-signal operator-signal--compact"><strong>{issues.filter((issue) => issue.status === 'candidate').length}</strong><span>room issues ready for CDH review</span></div>
          <div className="operator-issue-list">{issuesError ? <RetryNotice title="Room evidence unavailable" message="The current review list could not be loaded or updated." onRetry={() => void refreshIssues()} retrying={loadingIssues}/> : loadingIssues ? <small>Loading room evidence…</small> : issues.length === 0 ? <small>No repeated room issue has reached the review threshold.</small> : issues.slice(0, 3).map((issue) => <div key={issue.id}><span><strong>{issue.capacityName}</strong><small>{issue.issue} · {issue.independentReporterCount} independent reports · {issue.status}</small></span>{issue.status === 'candidate' && <button disabled={reviewingIssueId === issue.id} onClick={() => void validateIssue(issue)}>{reviewingIssueId === issue.id ? 'Validating…' : 'Validate'}</button>}</div>)}</div>
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
    </main>
  )
}

export default function App() {
  return window.location.pathname.startsWith(PATHS.product) ? <ProductApp /> : <Landing />
}
