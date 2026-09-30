import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowLeft, ArrowRight, BrainCircuit, Building2, Check,
  CircleGauge, Clock3, FlaskConical, Home, Map as MapIcon,
  Navigation, Play, ShieldAlert, Sparkles, Sun, ThermometerSun, Trees, Users, X,
} from 'lucide-react'
import CremorneMap from './CremorneMap'
import { currentDecisionContext, recommendCapacity, recordGraphOutcome, runControlledExperiment } from './api'
import type { ExperimentResponse, RecommendResponse } from './api-contracts'
import { buildExperimentRule, FIRST_EXCEPTION, simulateScenario } from './engine'
import { loadJourneyOutcomes, loadMemory, saveJourneyOutcome, saveRule } from './memory'
import type { MemoryRule } from './domain'
import {
  demandAtTime, evaluateProductRoutes, findSpaces, parseExperimentBrief, parseRouteBrief, parseSpaceBrief,
} from './product'
import type { EvaluatedProductRoute } from './product'
import { distanceMetres, isDistinctJourneyTrace, simulatedJourneyTrace, type JourneyPoint } from './journey-trace'

type ProductRole = 'demo' | 'worker' | 'operator'
type WorkerTask = 'route' | 'space'
type WorkerMode = 'mia' | 'explore'
type JourneyStage = 'setup' | 'results' | 'active' | 'feedback' | 'saved'
type OperatorStage = 'detect' | 'testing' | 'compare' | 'saved'
type DemoStage = 'scenario' | 'first-pass' | 'reveal' | 'remembered'

const PATHS = { landing: '/', product: '/app' }
const go = (path: string) => { window.location.href = path }
const percentDelta = (value: number) => `${value < 0 ? '−' : '+'}${Math.abs(value)}%`
const roomAvailabilityLeft = (id: string) => ({ boardroom: 13, workshop: 42, event: 0 }[id as 'boardroom' | 'workshop' | 'event'] ?? 0)

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
          <div className="persona-hero"><div>M</div><span><q>I plan my workday around light—the sun on my route, glare through a meeting-room window, even whether I can see the screen.</q><small>Mia · Cremorne worker with albinism, photosensitivity and low vision</small></span></div>
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
  const [weather, setWeather] = useState({ temperature: 31, uvIndex: 8.2, source: 'Scenario fallback' })
  useEffect(() => {
    const controller = new AbortController()
    fetch('https://api.open-meteo.com/v1/forecast?latitude=-37.83&longitude=144.995&hourly=temperature_2m,uv_index&forecast_days=2&timezone=Australia%2FSydney', { signal: controller.signal })
      .then((response) => response.json()).then((data) => {
        const index = data.hourly?.time?.findIndex((value: string) => value.endsWith('T16:00')) ?? -1
        if (index >= 0) setWeather({ temperature: Number(data.hourly.temperature_2m[index]), uvIndex: Number(data.hourly.uv_index[index]), source: '16:00 forecast · Open-Meteo' })
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
  const demoWeather = { temperature: Math.max(31, weather.temperature), uvIndex: Math.max(8.2, weather.uvIndex), source: 'High-UV demo day' }
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
      {role === 'worker' && <WorkerExperience task={task} setTask={setTask} weather={demoWeather} memory={memory} workerMode={workerMode} />}
      {role === 'operator' && <OperatorExperience weather={demoWeather} memory={memory} setMemory={setMemory} onSeeWorker={() => { setWorkerMode('mia'); setRole('worker'); setTask('route') }} />}
    </div>
  )
}

function GuidedDemo({ setMemory, onOpenWorker }: {
  setMemory: (memory: MemoryRule[]) => void
  onOpenWorker: () => void
}) {
  const [stage, setStage] = useState<DemoStage>('scenario')
  const [result, setResult] = useState(() => simulateScenario(300, 42))
  const [experiment, setExperiment] = useState<ExperimentResponse | null>(null)
  const runProof = async () => {
    setStage('first-pass')
    try {
      const response = await runControlledExperiment({
        brief: 'Redistribute 300 workers from Church Street over 15 minutes. Protect low-UV and mobility needs.',
        context: currentDecisionContext({ uvIndex: 8.2, temperature: 31, crowding: 92, workers: 300 }),
        seed: 42,
      })
      setResult(response.experiment)
      setExperiment(response)
    } catch { /* The seeded result stays visible if the API is unavailable. */ }
  }
  const rememberAndRetry = async () => {
    const rule = experiment?.candidateRule ?? FIRST_EXCEPTION
    setMemory(saveRule(rule))
    setStage('remembered')
    if (experiment) {
      try {
        await recordGraphOutcome({
          decisionId: experiment.decisionId,
          capacityUnitId: 'route-east-richmond-b',
          demand: experiment.demand,
          context: currentDecisionContext({ uvIndex: 8.2, temperature: 31, crowding: 92, workers: 300 }),
          metrics: {
            crowdingDelta: result.crowdingDelta,
            walkingDelta: result.walkingDelta,
            uvDeltaLowUv: result.uvDeltaLowUv,
            mobilityFrictionDelta: result.mobilityFrictionDelta,
          },
          candidateRule: rule,
        })
      } catch { /* Local Memory keeps the product usable. */ }
    }
  }
  const progress = stage === 'scenario' ? 0 : stage === 'first-pass' ? 1 : stage === 'reveal' ? 2 : 3

  return (
    <main className={`guided-demo demo-${stage}`}>
      <header className="demo-heading">
        <div><span>30-SECOND LIVE PROOF</span><h1>One outcome changes the next decision.</h1></div>
        <div className="demo-context"><span><Sun/>High UV · 8.2</span><span><Activity/>Crowding rising</span><span><Users/>300 workers</span></div>
      </header>

      <section className="demo-workbench">
        <div className="demo-visual">
          <div className="mia-chip"><div>M</div><span><small>MIA · WORKER WITH ALBINISM</small><strong>Low UV + low glare · arrive by 4:20</strong></span></div>
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
          <div className="route-tag route-tag-a"><i/>Route A <b>Accessible</b></div>
          <div className="route-tag route-tag-b"><i/>Route B <b>{stage === 'remembered' ? 'Filtered' : stage === 'scenario' ? '7 min' : 'Selected'}</b></div>
          <div className="route-tag route-tag-c"><i/>Shadow C <b>{stage === 'remembered' ? 'Eligible' : '82% shaded'}</b></div>
          {stage === 'remembered' && <div className="memory-retrieved"><BrainCircuit/><span>MEMORY RETRIEVED<strong>High UV + low-UV need</strong></span></div>}
        </div>

        <aside className="demo-story" aria-live="polite">
          {stage === 'scenario' && <div className="demo-story__stage" key="scenario">
            <span className="step-kicker">1 · SAME SCENARIO</span>
            <h2>Can Route B relieve the crowd?</h2>
            <p>Test one redistribution across the same 300 workers.</p>
            <div className="demo-question"><span>FASTEST</span><strong>Route B · 7 min</strong><ArrowRight/></div>
            <button className="primary-action" onClick={() => void runProof()}>Run the test <Play size={18}/></button>
          </div>}
          {stage === 'first-pass' && <div className="demo-story__stage" key="first-pass">
            <span className="step-kicker">2 · APPARENT SUCCESS</span>
            <h2>Route B looks successful.</h2>
            <div className="result-pair"><div><span>CROWDING</span><strong>{percentDelta(result.crowdingDelta)}</strong><small>better</small></div><div><span>WALK TIME</span><strong>{percentDelta(result.walkingDelta)}</strong><small>better</small></div></div>
            <div className="apparent-winner"><Check/><span><small>BEST PRECINCT AVERAGE</small><strong>Route B · Direct</strong></span></div>
            <button className="primary-action" onClick={() => setStage('reveal')}>Who did we miss? <ArrowRight size={18}/></button>
          </div>}
          {stage === 'reveal' && <div className="demo-story__stage" key="reveal">
            <span className="step-kicker coral">3 · MEASURE THE OUTCOME</span>
            <h2>The average hid two failures.</h2>
            <div className="demo-exceptions"><div><Sun/><span>LOW-UV COHORT<strong>Exposure {percentDelta(result.uvDeltaLowUv)}</strong></span></div><div><Navigation/><span>MOBILITY COHORT<strong>Friction {percentDelta(result.mobilityFrictionDelta)}</strong></span></div></div>
            <p className="demo-insight">A successful average is not a safe universal rule.</p>
            <button className="primary-action" onClick={() => void rememberAndRetry()}>Remember the exception <BrainCircuit size={18}/></button>
          </div>}
          {stage === 'remembered' && <div className="demo-story__stage" key="remembered">
            <span className="step-kicker">4 · NEXT DECISION</span>
            <h2>Memory changes the next decision.</h2>
            <div className="remembered-choice blocked"><X/><span><small>ROUTE B</small><strong>Outside Mia’s eligible set</strong></span></div>
            <div className="remembered-choice eligible"><Check/><span><small>SHADOW ROUTE C</small><strong>Eligible · lower exposure · on time</strong></span></div>
            <div className="remembered-rule"><span>WHEN</span><strong>UV ≥ 7 + low-UV required</strong><span>THEN</span><strong>Filter Route B before ranking</strong></div>
            <button className="primary-action" onClick={onOpenWorker}>Continue as Mia <ArrowRight size={18}/></button>
            <button className="secondary-action" onClick={() => setStage('scenario')}>Replay the proof</button>
          </div>}
        </aside>
      </section>

      <footer className="demo-footer">
        <div className="demo-progress-line">{['Scenario', 'First pass', 'Reveal', 'Next decision'].map((label, index) => <span key={label} className={progress >= index ? 'is-on' : ''}><i>{progress > index ? <Check/> : index + 1}</i>{label}</span>)}</div>
        <p><strong>Synthetic MVP output</strong> · same demand, UV and seed across the comparison</p>
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
        <div className="live-context"><b>DEMO DAY</b><span><ThermometerSun size={15} />{weather.temperature.toFixed(0)}°</span><span><Sun size={15} />UV {weather.uvIndex.toFixed(1)}</span></div>
      </header>
      {task === 'route' ? <RouteJourney key={`route-${workerMode}`} weather={weather} memory={memory} workerMode={workerMode} /> : <SpaceJourney key={`space-${workerMode}`} workerMode={workerMode} />}
    </main>
  )
}

function JourneyProgress({ stage }: { stage: JourneyStage }) {
  const current = stage === 'setup' ? 0 : stage === 'results' ? 1 : 2
  return <div className="journey-progress" aria-label="Journey progress">{['Your need', 'Choose', 'Complete'].map((label, index) => <div key={label} className={current >= index ? 'is-on' : ''}><i>{current > index ? <Check size={11} /> : index + 1}</i><span>{label}</span></div>)}</div>
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
    ? 'I have albinism. Get me to East Richmond by 4:20pm with minimal direct sun and glare. I can wait up to 10 minutes.'
    : 'Get me to Richmond by 5:30pm. Prefer a less crowded route. I can wait up to 15 minutes.')
  const [selectedId, setSelectedId] = useState<string>()
  const [startedAt, setStartedAt] = useState<number>()
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [personalOutcomes, setPersonalOutcomes] = useState(() => loadJourneyOutcomes())
  const [decision, setDecision] = useState<RecommendResponse | null>(null)
  const [isFinding, setIsFinding] = useState(false)
  const [clarification, setClarification] = useState<string | null>(null)
  const [journeyTrace, setJourneyTrace] = useState<JourneyPoint[]>([])
  const [feedback, setFeedback] = useState<'better' | 'same' | 'worse' | null>(null)
  const [shareStatus, setShareStatus] = useState<'idle' | 'sharing' | 'shared' | 'kept-private' | 'error'>('idle')
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

  const resetForInput = () => { setStage('setup'); setSelectedId(undefined); setStartedAt(undefined); setElapsedSeconds(0); setDecision(null); setClarification(null); setJourneyTrace([]); setFeedback(null); setShareStatus('idle') }
  const findRoutes = async () => {
    setIsFinding(true); setClarification(null)
    try {
      const response = await recommendCapacity({
        brief,
        context: currentDecisionContext({ uvIndex: weather.uvIndex, crowding: Math.min(99, Math.round(58 + workers / 5)), workers }),
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
    setJourneyTrace((current) => {
      const nearRoute = current.length > 1 && distanceMetres(current[0], selected.coordinates[0]) < 1_000
      return nearRoute ? current : simulatedJourneyTrace(selected.coordinates, 1)
    })
    setStage('feedback')
  }
  const persistOutcome = async (value: 'better' | 'same' | 'worse', shareTrace: boolean) => {
    if (!decision) return null
    const graphOption = decision.options.find((option) => option.productId === selected.id)
    if (!graphOption) return null
    return recordGraphOutcome({
      decisionId: decision.decisionId,
      capacityUnitId: graphOption.id,
      demand: decision.demand,
      context: currentDecisionContext({ uvIndex: weather.uvIndex, crowding: Math.min(99, Math.round(58 + workers / 5)), workers }),
      feedback: value,
      metrics: { elapsedSeconds, predictedMinutes: selected.durationMin, exposureIndex: selected.exposureIndex },
      journeyTrace: shareTrace ? journeyTrace : undefined,
      shareTrace,
      candidateRouteName: `Worker-discovered path to ${decision.resolvedDestination?.name ?? parsedBrief.destination}`,
    })
  }
  const recordFeedback = async (value: 'better' | 'same' | 'worse') => {
    setFeedback(value)
    setPersonalOutcomes(saveJourneyOutcome({ routeId: selected.id, routeName: selected.name, completedAt: new Date().toISOString(), elapsedSeconds, predictedMinutes: selected.durationMin, exposureIndex: selected.exposureIndex, feedback: value }))
    setStage('saved')
    const canShareNewPath = value === 'better' && isDistinctJourneyTrace(journeyTrace, selected.coordinates)
    if (!canShareNewPath) {
      try { await persistOutcome(value, false) } catch { /* Personal Memory remains available. */ }
    }
  }
  const canShareNewPath = feedback === 'better' && isDistinctJourneyTrace(journeyTrace, selected.coordinates)
  const chooseTraceSharing = async (shareTrace: boolean) => {
    if (!feedback) return
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
          {workerMode === 'mia' && <span className="step-kicker">MIA · ALBINISM + LOW VISION</span>}<h1>What journey do you need?</h1><p>{workerMode === 'mia' ? 'Direct UV, glare, time and local Memory shape Mia’s options.' : 'Describe it in your own words.'}</p>
          <label className="brief-composer"><span>JOURNEY BRIEF</span><textarea value={brief} onChange={(event) => { setBrief(event.target.value); resetForInput() }} rows={4}/></label>
          <div className="brief-understood"><span>UNDERSTOOD</span><div>{parsedBrief.chips.map((chip) => <b key={chip}>{chip}</b>)}</div></div>
          {clarification && <div className="honest-gap"><ShieldAlert/><div><strong>Which destination?</strong><span>{clarification}</span></div></div>}
          <button className="primary-action" disabled={isFinding} onClick={findRoutes}>{isFinding ? 'Understanding your journey…' : 'Find guided actions'} <ArrowRight size={18} /></button>
        </div>}

        {stage === 'results' && <div className="journey-step">
          <button className="back-action" onClick={() => setStage('setup')}><ArrowLeft size={15} /> Change brief</button><h1>{noEligible ? 'No eligible action yet.' : 'Choose an action.'}</h1><p>{noEligible ? 'A required constraint cannot yet be verified.' : `${routes.filter((route) => route.eligible).length} actions fit your brief`}</p>
          {noEligible ? <div className="honest-gap"><ShieldAlert /><div><strong>Required evidence unavailable</strong><span>{routes[0]?.reasons[0]}</span></div></div> : <div className="choice-list">{routes.map((route) => { const remaining = Math.max(0, route.remainingCapacity); return <button key={route.id} disabled={!route.eligible} onClick={() => setSelectedId(route.id)} className={`${selected.id === route.id ? 'is-selected' : ''} ${!route.eligible ? 'is-blocked' : ''}`}><i /><div><span>{route.recommended ? 'BEST FIT' : route.eligible ? 'ALTERNATIVE' : 'NOT ELIGIBLE'}</span><strong>{route.name}</strong><small>{route.eligible ? `${route.suggestedDelayMin ? `Leave in ${route.suggestedDelayMin} min` : 'Leave now'} · ${route.durationMin} min walk · ${remaining} capacity remaining` : route.reasons[0]}</small>{selected.id === route.id && route.eligible && <ul className="route-reasons">{route.reasons.slice(0, 3).map((reason) => <li key={reason}><Check size={12}/>{reason}</li>)}</ul>}</div>{selected.id === route.id && <Check size={17} />}</button> })}</div>}
          {!noEligible && <button className="primary-action" onClick={startJourney}>Start live guidance <Navigation size={18} /></button>}
        </div>}

        {stage === 'active' && <div className="journey-step active-journey">
          <span className="step-kicker live"><i /> LIVE GUIDANCE</span><h1>{selected.name}</h1><div className="journey-live-progress"><div><strong>On track</strong></div><div className="journey-live-progress__track" role="progressbar" aria-label="Estimated journey progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(journeyProgress)}><i style={{ width: `${journeyProgress}%` }} /></div></div><div className="live-expectation"><Clock3/><span><small>EXPECTED</small><strong>{selected.durationMin} min · arrival by {parsedBrief.deadlineLabel}</strong></span></div><div className="next-turn"><Navigation /><div><span>NEXT · HIGH-CONTRAST + VIBRATION CUE</span><strong>Continue along Balmain Street</strong><small>enter the covered passage to reduce direct sun and glare</small></div></div><button className="primary-action" onClick={finishJourney}>I’ve arrived <Check size={18} /></button>
        </div>}

        {stage === 'feedback' && <div className="journey-step arrival-card">
          <div className="arrival-icon"><Check /></div><span className="step-kicker">ARRIVED</span><h1>How did this journey feel?</h1><div className="captured-path"><TracePreview points={journeyTrace}/><span><small>YOUR JOURNEY</small><strong>Path captured</strong></span></div><div className="arrival-metrics"><div><strong>{Math.max(1, Math.round(elapsedSeconds / 60))}</strong><span>minutes observed</span></div><div><strong>{selected.durationMin}</strong><span>minutes expected</span></div><div><strong>{selected.exposureIndex}</strong><span>UV load estimate</span></div></div><div className="feedback-row">{(['better', 'same', 'worse'] as const).map((value) => <button key={value} onClick={() => void recordFeedback(value)}>{value === 'better' ? 'Better' : value === 'same' ? 'Same' : 'Worse'}</button>)}</div>
        </div>}

        {stage === 'saved' && <div className="journey-step saved-card">
          <div className="arrival-icon"><BrainCircuit /></div><span className="step-kicker">PERSONAL MEMORY UPDATED</span><h1>{canShareNewPath ? 'You found another way.' : 'Your next journey starts smarter.'}</h1><div className="feedback-saved"><Check/><span>{canShareNewPath ? 'This path differs from the routes Cremorne currently knows.' : 'This outcome can shape your next similar journey.'}</span></div>
          {canShareNewPath && shareStatus === 'idle' && <div className="share-path-card"><TracePreview points={journeyTrace}/><div><strong>Share this path with Cremorne?</strong><span>It becomes a candidate path for CDH to validate.</span></div><button className="primary-action" onClick={() => void chooseTraceSharing(true)}>Share path <ArrowRight size={17}/></button><button className="secondary-action" onClick={() => void chooseTraceSharing(false)}>Keep private</button></div>}
          {shareStatus === 'sharing' && <div className="feedback-saved"><Activity/><span>Adding the path to the Capacity Graph…</span></div>}
          {shareStatus === 'shared' && <div className="candidate-saved"><Check/><span><strong>Candidate path added</strong><small>CDH can compare it before wider guidance.</small></span></div>}
          {shareStatus === 'kept-private' && canShareNewPath && <div className="feedback-saved"><Check/><span>Only your personal outcome was retained.</span></div>}
          {shareStatus === 'error' && <div className="honest-gap"><ShieldAlert/><div><strong>Path not shared yet</strong><span>Your personal outcome is still saved.</span></div></div>}
          {(!canShareNewPath || shareStatus !== 'idle') && shareStatus !== 'sharing' && <button className="primary-action" onClick={resetForInput}>Plan another journey <ArrowRight size={18} /></button>}
        </div>}
      </aside>

      <div className="journey-map">
        <CremorneMap routes={routes} selectedId={selected?.id} onSelect={(id) => { setSelectedId(id); if (stage === 'setup') setStage('results') }} showTrees journeyProgress={stage === 'active' ? journeyProgress / 100 : undefined} journeyTrace={journeyTrace} />
        <div className="map-context"><span><Trees size={15} /> canopy</span><span><Users size={15} /> {workers} expected</span>{memory.length > 0 && <span className="memory-on"><BrainCircuit size={15} /> local rule applied</span>}</div>
        {stage === 'active' && <div className="map-active-banner"><Navigation size={16} /><span>Journey in progress</span></div>}
      </div>
    </section>
  )
}

function SpaceJourney({ workerMode }: { workerMode: WorkerMode }) {
  const initialBrief = workerMode === 'mia'
    ? 'Find a 4-person hybrid room at 2pm with a display and adjustable blinds. Avoid glare.'
    : 'Find a 6-person hybrid room at 2pm.'
  const [brief, setBrief] = useState(initialBrief)
  const [appliedBrief, setAppliedBrief] = useState(initialBrief)
  const [selectedId, setSelectedId] = useState('boardroom')
  const [bookingStage, setBookingStage] = useState<'available' | 'booked'>('available')
  const [decision, setDecision] = useState<RecommendResponse | null>(null)
  const [isSearching, setIsSearching] = useState(false)
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
  const eligibleSpaces = results.filter((space) => space.eligible)
  const selected = eligibleSpaces.find((space) => space.id === selectedId) ?? eligibleSpaces[0] ?? results[0]
  const selectedOption = decision?.options.find((option) => option.productId === selected?.id)
  const optionFor = (spaceId: string) => decision?.options.find((option) => option.productId === spaceId)
  const chooseSpace = (id: string) => { setSelectedId(id); setBookingStage('available') }
  const searchSpaces = async () => {
    setAppliedBrief(brief); setBookingStage('available'); setIsSearching(true)
    try {
      const response = await recommendCapacity({
        brief,
        context: currentDecisionContext({ uvIndex: 8.2, temperature: 31, crowding: 64, workers: 300 }),
        useMemory: true,
      })
      setDecision(response)
      setSelectedId(response.recommendation?.productId ?? response.options.find((option) => option.eligible)?.productId ?? 'boardroom')
    } catch { setDecision(null) }
    finally { setIsSearching(false) }
  }

  return (
    <section className="space-experience">
      <aside className="space-search">{workerMode === 'mia' && <span className="step-kicker">MIA’S WORKSPACE NEEDS</span>}<h1>What space do you need?</h1><p>{workerMode === 'mia' ? 'Sun control and low glare shape Mia’s options.' : 'Describe the meeting, time and equipment.'}</p><label className="brief-composer"><span>SPACE BRIEF</span><textarea value={brief} onChange={(event) => setBrief(event.target.value)} rows={4}/></label><div className="duration-picker"><span>DURATION</span><div>{[30, 45, 60, 90].map((minutes) => <button key={minutes} className={parsedDraft.durationMinutes === minutes ? 'is-active' : ''} onClick={() => setBrief((current) => withSpaceDuration(current, minutes))}>{minutes} min</button>)}</div></div><div className="brief-understood"><span>UNDERSTOOD</span><div>{parsedDraft.chips.map((chip) => <b key={chip}>{chip}</b>)}</div></div><button className="primary-action space-search-action" disabled={isSearching} onClick={() => void searchSpaces()}>{isSearching ? 'Matching space × time…' : 'Find spaces'} <ArrowRight size={17}/></button><div className="space-match-count"><strong>{eligibleSpaces.length}</strong><span>eligible at {parsedBrief.timeLabel}</span></div>{eligibleSpaces.length > 0 ? <div className="choice-list space-choice-list">{eligibleSpaces.map((space) => <button key={space.id} onClick={() => chooseSpace(space.id)} className={selected.id === space.id ? 'is-selected' : ''}><i/><div><span>SHARED · AVAILABLE TO BOOK</span><strong>{space.name.replace('CDH ', '')}</strong><small>{space.capacity} people · {optionFor(space.id)?.availableFrom ?? parsedBrief.timeLabel}–{optionFor(space.id)?.availableUntil ?? bookingEnd(parsedBrief.timeLabel, parsedBrief.durationMinutes)}</small></div><Check size={16}/></button>)}</div> : <div className="honest-gap"><ShieldAlert/><div><strong>No eligible space at {parsedBrief.timeLabel}</strong><span>Change the time or remove a non-essential requirement.</span></div></div>}</aside>
      <div className="space-canvas"><div className="space-floor-label">CDH · LEVEL 1</div>{results.map((space, index) => <button key={space.id} disabled={!space.eligible} onClick={() => chooseSpace(space.id)} className={`room-shape room-${index + 1} ${selected.id === space.id ? 'is-selected' : ''} ${space.eligible ? 'is-eligible' : 'is-blocked'}`}><Building2 /><strong>{space.name.replace('CDH ', '')}</strong><span>{roomAvailabilityLeft(space.id)}% left</span></button>)}<div className="floor-corridor">SHARED CORRIDOR</div></div>
      <aside className="space-confirm"><span className="step-kicker">{selected.eligible ? 'BEST ELIGIBLE SPACE' : 'NOT A MATCH'}</span><h2>{selected.name}</h2><div className="space-access-class">{selected.accessClass === 'shared' ? 'SHARED SPACE' : 'INTERNAL SPACE'}</div><div className="capacity-number"><strong>{selected.capacity}</strong><span>people</span></div><div className="facility-list">{selected.facilities.map((facility) => <span key={facility}>{facility}</span>)}</div>{selectedOption?.explanation && <p className="space-why"><strong>Why this room</strong>{selectedOption.explanation}</p>}{selected.eligible && bookingStage === 'available' && <><div className="booking-time"><Clock3 /><span><small>AVAILABLE FOR THE FULL MEETING</small><strong>{selectedOption?.availableFrom ?? parsedBrief.timeLabel}–{selectedOption?.availableUntil ?? bookingEnd(parsedBrief.timeLabel, parsedBrief.durationMinutes)}</strong></span></div><button className="primary-action" onClick={() => setBookingStage('booked')}>Book this room <Check size={18} /></button></>}{selected.eligible && bookingStage === 'booked' && <div className="booking-flow booking-complete"><div className="arrival-icon"><Check/></div><span className="step-kicker">ROOM BOOKED</span><strong>{selectedOption?.availableFrom ?? parsedBrief.timeLabel}–{selectedOption?.availableUntil ?? bookingEnd(parsedBrief.timeLabel, parsedBrief.durationMinutes)} · {selected.name}</strong><p>Capacity, equipment and the full time window are confirmed.</p><button className="secondary-action" onClick={() => setBookingStage('available')}>Find another room</button></div>}{!selected.eligible && <div className="honest-gap"><ShieldAlert /><div><strong>Filtered by the brief</strong><span>{selected.blockers.join(' · ')}</span></div></div>}</aside>
    </section>
  )
}

function OperatorProgress({ stage }: { stage: OperatorStage }) {
  const current = stage === 'detect' ? 0 : stage === 'testing' ? 1 : stage === 'compare' ? 2 : 3
  return <div className="operator-progress">{['Define', 'Test', 'Measure', 'Publish'].map((label, index) => <div key={label} className={current >= index ? 'is-on' : ''}><i>{current > index ? <Check size={11}/> : index + 1}</i><span>{label}</span></div>)}</div>
}

function LoadSplit({ label, loads, workers }: { label: string; loads: Record<'A' | 'B' | 'C', number>; workers: number }) {
  return <div className="load-split"><strong>{label}</strong><div>{(['A', 'B', 'C'] as const).map((route) => <span key={route} style={{ flex: loads[route] }} className={`load-${route.toLowerCase()}`} title={`Route ${route}: ${loads[route]} workers`}>{route}<small>{Math.round(loads[route] / workers * 100)}%</small></span>)}</div></div>
}

function OperatorExperience({ weather, memory, setMemory, onSeeWorker }: {
  weather: { uvIndex: number }
  memory: MemoryRule[]
  setMemory: (memory: MemoryRule[]) => void
  onSeeWorker: () => void
}) {
  const [stage, setStage] = useState<OperatorStage>('detect')
  const [experimentBrief, setExperimentBrief] = useState('Redistribute 300 workers from Church Street over 15 minutes. Protect low-UV and mobility needs.')
  const parsedExperiment = useMemo(() => parseExperimentBrief(experimentBrief), [experimentBrief])
  const [result, setResult] = useState(() => simulateScenario(300, 42))
  const [candidateRule, setCandidateRule] = useState<MemoryRule>(FIRST_EXCEPTION)
  const [experimentResponse, setExperimentResponse] = useState<ExperimentResponse | null>(null)
  const predictedLoad = Math.min(99, Math.round(72 + parsedExperiment.workers / 15))
  const frictionMinutesRemoved = Math.round(parsedExperiment.workers * Math.abs(result.walkingDelta) / 100 * 10)
  const runTest = async () => {
    setStage('testing')
    const minimumRunTime = new Promise((resolve) => window.setTimeout(resolve, 1300))
    const uvIndex = Math.max(8.2, weather.uvIndex)
    const localResult = simulateScenario(parsedExperiment.workers, 42, parsedExperiment.horizonMin)
    const localRule = buildExperimentRule({ place: parsedExperiment.place, uvIndex, crowding: predictedLoad, result: localResult })

    try {
      const data = await runControlledExperiment({
        brief: experimentBrief,
        context: currentDecisionContext({ uvIndex, temperature: 31, crowding: predictedLoad, workers: parsedExperiment.workers }),
        seed: 42,
      })
      setResult(data.experiment)
      setCandidateRule(data.candidateRule)
      setExperimentResponse(data)
    } catch {
      setResult(localResult)
      setCandidateRule(localRule)
    }

    await minimumRunTime
    setStage('compare')
  }
  const storeRule = async () => {
    setMemory(saveRule(candidateRule)); setStage('saved')
    if (!experimentResponse) return
    try {
      await recordGraphOutcome({
        decisionId: experimentResponse.decisionId,
        capacityUnitId: 'route-east-richmond-b',
        demand: experimentResponse.demand,
        context: currentDecisionContext({ uvIndex: Math.max(8.2, weather.uvIndex), temperature: 31, crowding: predictedLoad, workers: parsedExperiment.workers }),
        metrics: {
          crowdingDelta: result.crowdingDelta,
          walkingDelta: result.walkingDelta,
          uvDeltaLowUv: result.uvDeltaLowUv,
          mobilityFrictionDelta: result.mobilityFrictionDelta,
        },
        candidateRule,
      })
    } catch { /* Local Memory keeps the product usable. */ }
  }
  return (
    <main className="operator-clear">
      <header className="operator-heading"><div><span className="step-kicker">CONTROLLED COMPARISON</span><h1>Measure an intervention before it becomes guidance.</h1></div><OperatorProgress stage={stage} /></header>
      <section className="operator-workbench">
        <div className={`operator-scene stage-${stage}`}>
          <div className="scene-top"><span><Activity size={15}/> {parsedExperiment.place}</span><span><Sun size={15}/> UV {Math.max(8.2, weather.uvIndex).toFixed(1)}</span><span><Users size={15}/> {parsedExperiment.workers} workers</span></div>
          <svg viewBox="0 0 780 420" role="img" aria-label="Intervention comparison across three routes"><path className="op-road road-a" d="M70 350 C220 270 310 225 430 195 S620 135 710 62"/><path className="op-road road-b" d="M70 350 C205 175 335 100 485 125 S620 108 710 62"/><path className="op-road road-c" d="M70 350 C220 360 350 330 470 270 S635 150 710 62"/>{stage === 'testing' && <circle className="op-traveller traveller-b" r="8"><animateMotion dur="2.1s" repeatCount="indefinite" path="M70 350 C205 175 335 100 485 125 S620 108 710 62"/></circle>}{stage === 'saved' && <circle className="op-traveller traveller-c" r="8"><animateMotion dur="2.6s" repeatCount="indefinite" path="M70 350 C220 360 350 330 470 270 S635 150 710 62"/></circle>}<g className="op-blocks"><rect x="190" y="280" width="95" height="67"/><rect x="360" y="155" width="105" height="72"/><rect x="545" y="75" width="92" height="70"/></g><g className="op-crowd">{Array.from({ length: 28 }).map((_, index) => <circle key={index} cx={95 + index * 18} cy={336 - index * 7 + (index % 3) * 8} r="5"/>)}</g><circle className="op-origin" cx="70" cy="350" r="13"/><circle className="op-target" cx="710" cy="62" r="13"/></svg>
          <div className="scene-legend"><span><i className="a"/>Accessible A</span><span><i className="b"/>Direct B</span><span><i className="c"/>Shadow C</span></div>
        </div>
        <aside className="operator-decision">
          {stage === 'detect' && <><span className="step-kicker">1 · DEFINE THE TEST</span><h2>What should CDH evaluate?</h2><label className="brief-composer operator-brief"><span>INTERVENTION BRIEF</span><textarea value={experimentBrief} onChange={(event) => setExperimentBrief(event.target.value)} rows={4}/></label><div className="brief-understood"><span>TEST DESIGN</span><div>{parsedExperiment.chips.map((chip) => <b key={chip}>{chip}</b>)}</div></div><div className="operator-signal operator-signal--compact"><strong>{predictedLoad}%</strong><span>predicted load · {parsedExperiment.horizonMin}-minute horizon</span></div><button className="primary-action" onClick={runTest}>Run controlled comparison <Play size={18}/></button></>}
          {stage === 'testing' && <div className="testing-state"><div className="testing-orb"><Activity/></div><span>CONTROLLED RUN</span><h2>Two allocations. The same {parsedExperiment.workers} workers, UV and seed.</h2></div>}
          {stage === 'compare' && <><span className="step-kicker">3 · MEASURED EFFECT</span><h2>The redistribution helped overall—and exposed a boundary.</h2><div className="allocation-compare"><LoadSplit label="CURRENT FLOW" loads={result.baselineLoads} workers={parsedExperiment.workers}/><ArrowRight/><LoadSplit label="TESTED REDISTRIBUTION" loads={result.interventionLoads} workers={parsedExperiment.workers}/></div><div className="result-pair"><div><span>PEAK CROWDING</span><strong>{percentDelta(result.crowdingDelta)}</strong><small>modelled change</small></div><div><span>FRICTION REMOVED</span><strong>{frictionMinutesRemoved}</strong><small>worker-minutes</small></div></div><div className="effectiveness-row"><span><small>AVG WALK TIME</small><strong>{percentDelta(result.walkingDelta)}</strong></span><span><small>CONFIDENCE</small><strong>{Math.round(candidateRule.confidence * 100)}%</strong></span></div><div className="exception-found"><ShieldAlert/><div><span>BOUNDARY FOUND</span><strong>Low-UV exposure {percentDelta(result.uvDeltaLowUv)}</strong><small>Mobility friction {percentDelta(result.mobilityFrictionDelta)}</small></div></div><p className="synthetic-label">Synthetic controlled MVP run</p><button className="primary-action" onClick={() => void storeRule()}>Publish the boundary <BrainCircuit size={18}/></button></>}
          {stage === 'saved' && <><div className="saved-badge"><BrainCircuit/></div><span className="step-kicker">4 · PUBLISHED TO MEMORY</span><h2>This result now changes Mia’s next decision.</h2><div className="operator-rule"><span>WHEN</span><strong>{candidateRule.context.place} · UV ≥ {candidateRule.context.uvMin} · low-UV required</strong><span>THEN</span><strong>Filter Route B before ranking</strong></div><div className="published-impact"><Check/><span><strong>{memory.some((rule) => rule.id === candidateRule.id) ? 'Rule available to Worker Guide' : 'Publishing rule'}</strong><small>Outcome and boundary travel together</small></span></div><button className="primary-action" onClick={onSeeWorker}>See Mia’s next decision <ArrowRight size={18}/></button><button className="secondary-action" onClick={() => setStage('detect')}>Define another experiment</button></>}
        </aside>
      </section>
      <section className="technical-drawer" aria-label="Experiment data flow">
        <div><strong>1 · SCENARIO</strong><span>brief + signals</span></div><ArrowRight/>
        <div><strong>2 · TEST</strong><span>two allocations</span></div><ArrowRight/>
        <div><strong>3 · OUTCOME</strong><span>average + cohorts</span></div><ArrowRight/>
        <div><strong>4 · MEMORY</strong><span>candidate rule + boundary</span></div><ArrowRight/>
        <div><strong>5 · WORKER GUIDE</strong><span>eligible set re-ranked</span></div>
      </section>
    </main>
  )
}

export default function App() {
  return window.location.pathname.startsWith(PATHS.product) ? <ProductApp /> : <Landing />
}
