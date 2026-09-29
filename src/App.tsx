import { useEffect, useMemo, useState } from 'react'
import {
  Activity, ArrowLeft, ArrowRight, BrainCircuit, Building2, Check,
  CircleGauge, Clock3, FlaskConical, Home, Map as MapIcon,
  Navigation, Play, ShieldAlert, Sparkles, Sun, ThermometerSun, Trees, Users, X,
} from 'lucide-react'
import CremorneMap from './CremorneMap'
import { FIRST_EXCEPTION, simulateScenario } from './engine'
import { loadJourneyOutcomes, loadMemory, saveJourneyOutcome, saveRule } from './memory'
import type { MemoryRule } from './domain'
import {
  demandAtTime, evaluateProductRoutes, findSpaces, parseExperimentBrief, parseRouteBrief, parseSpaceBrief,
} from './product'

type ProductRole = 'demo' | 'worker' | 'operator'
type WorkerTask = 'route' | 'space'
type WorkerMode = 'mia' | 'explore'
type JourneyStage = 'setup' | 'results' | 'active' | 'feedback' | 'saved'
type OperatorStage = 'detect' | 'testing' | 'compare' | 'saved'
type DemoStage = 'scenario' | 'first-pass' | 'reveal' | 'remembered'
type EngineStatus = 'ready' | 'running' | 'api' | 'local'

const PATHS = { landing: '/', product: '/app' }
const go = (path: string) => { window.location.href = path }
const percentDelta = (value: number) => `${value < 0 ? '−' : '+'}${Math.abs(value)}%`
const formatElapsed = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

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
          <div className="persona-hero"><div>M</div><span><q>I need to reach East Richmond by 4:20 without direct sun or glare. Show me what will work today.</q><small>Mia · Cremorne worker with albinism, photosensitivity and low vision</small></span></div>
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
          <button className={role === 'worker' ? 'is-active' : ''} onClick={() => { setWorkerMode('explore'); setRole('worker') }}><Users size={16} /> Worker guide</button>
          <button className={role === 'operator' ? 'is-active' : ''} onClick={() => setRole('operator')}><FlaskConical size={16} /> CDH experiment</button>
        </div>
        <div className="product-status">{role === 'demo' && <span className="is-on"><Sparkles size={15}/>30 sec</span>}{role !== 'demo' && memory.length > 0 && <span className="is-on"><BrainCircuit size={15}/>Memory on</span>}<a href={PATHS.landing}><Home size={17} /><span>Home</span></a></div>
      </header>
      {role === 'demo' && <GuidedDemo setMemory={setMemory} onOpenWorker={() => { setWorkerMode('mia'); setRole('worker'); setTask('route') }} />}
      {role === 'worker' && <WorkerExperience task={task} setTask={setTask} weather={demoWeather} memoryActive={memory.length > 0} workerMode={workerMode} />}
      {role === 'operator' && <OperatorExperience weather={demoWeather} memory={memory} setMemory={setMemory} onSeeWorker={() => { setWorkerMode('explore'); setRole('worker'); setTask('route') }} />}
    </div>
  )
}

function GuidedDemo({ setMemory, onOpenWorker }: {
  setMemory: (memory: MemoryRule[]) => void
  onOpenWorker: () => void
}) {
  const [stage, setStage] = useState<DemoStage>('scenario')
  const result = useMemo(() => simulateScenario(300, 42), [])
  const rememberAndRetry = () => {
    setMemory(saveRule(FIRST_EXCEPTION))
    setStage('remembered')
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
            <button className="primary-action" onClick={() => setStage('first-pass')}>Run the test <Play size={18}/></button>
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
            <button className="primary-action" onClick={rememberAndRetry}>Remember the exception <BrainCircuit size={18}/></button>
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

function WorkerExperience({ task, setTask, weather, memoryActive, workerMode }: {
  task: WorkerTask
  setTask: (task: WorkerTask) => void
  weather: { temperature: number; uvIndex: number; source: string }
  memoryActive: boolean
  workerMode: WorkerMode
}) {
  return (
    <main className="worker-clear">
      <header className="task-switcher">
        <div><span>What do you need?</span><strong>{task === 'route' ? 'Get somewhere' : 'Find a workspace'}</strong></div>
        <div role="group" aria-label="Choose worker task"><button className={task === 'route' ? 'is-active' : ''} onClick={() => setTask('route')}><MapIcon size={17} /> Plan a route</button><button className={task === 'space' ? 'is-active' : ''} onClick={() => setTask('space')}><Building2 size={17} /> Find a room</button></div>
        <div className="live-context"><b>DEMO DAY</b><span><ThermometerSun size={15} />{weather.temperature.toFixed(0)}°</span><span><Sun size={15} />UV {weather.uvIndex.toFixed(1)}</span></div>
      </header>
      {task === 'route' ? <RouteJourney key={`route-${workerMode}`} weather={weather} memoryActive={memoryActive} workerMode={workerMode} /> : <SpaceJourney key={`space-${workerMode}`} workerMode={workerMode} />}
    </main>
  )
}

function JourneyProgress({ stage }: { stage: JourneyStage }) {
  const current = stage === 'setup' ? 0 : stage === 'results' ? 1 : 2
  return <div className="journey-progress" aria-label="Journey progress">{['Your need', 'Choose', 'Complete'].map((label, index) => <div key={label} className={current >= index ? 'is-on' : ''}><i>{current > index ? <Check size={11} /> : index + 1}</i><span>{label}</span></div>)}</div>
}

function RouteJourney({ weather, memoryActive, workerMode }: { weather: { uvIndex: number }; memoryActive: boolean; workerMode: WorkerMode }) {
  const [stage, setStage] = useState<JourneyStage>('setup')
  const [brief, setBrief] = useState(workerMode === 'mia'
    ? 'I have albinism. Get me to East Richmond by 4:20pm with minimal direct sun and glare. I can wait up to 10 minutes.'
    : 'Get me to Richmond by 5:30pm. Prefer a less crowded route. I can wait up to 15 minutes.')
  const [selectedId, setSelectedId] = useState<string>()
  const [feedback, setFeedback] = useState<'better' | 'same' | 'worse'>()
  const [startedAt, setStartedAt] = useState<number>()
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [personalOutcomes, setPersonalOutcomes] = useState(() => loadJourneyOutcomes())
  const parsedBrief = useMemo(() => parseRouteBrief(brief), [brief])
  const workers = demandAtTime(parsedBrief.destination, parsedBrief.departure)
  const routes = useMemo(() => evaluateProductRoutes({ destination: parsedBrief.destination, need: parsedBrief.need, strength: parsedBrief.strength, flexibilityMin: parsedBrief.flexibilityMin, uvIndex: weather.uvIndex, workers, memoryActive, personalOutcomes }), [parsedBrief, weather.uvIndex, workers, memoryActive, personalOutcomes])
  const selected = routes.find((route) => route.id === selectedId && route.eligible) ?? routes.find((route) => route.eligible) ?? routes[0]
  const noEligible = routes.every((route) => !route.eligible)

  useEffect(() => {
    if (stage !== 'active' || !startedAt) return
    const timer = window.setInterval(() => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000))), 1000)
    return () => window.clearInterval(timer)
  }, [stage, startedAt])

  const resetForInput = () => { setStage('setup'); setSelectedId(undefined); setStartedAt(undefined); setElapsedSeconds(0); setFeedback(undefined) }
  const findRoutes = () => { setSelectedId(routes.find((route) => route.eligible)?.id); setStage('results') }
  const startJourney = () => { setStartedAt(Date.now()); setElapsedSeconds(0); setStage('active') }
  const finishJourney = () => {
    if (startedAt) setElapsedSeconds(Math.max(1, Math.floor((Date.now() - startedAt) / 1000)))
    setStage('feedback')
  }
  const recordFeedback = (value: 'better' | 'same' | 'worse') => {
    setFeedback(value)
    setPersonalOutcomes(saveJourneyOutcome({ routeId: selected.id, routeName: selected.name, completedAt: new Date().toISOString(), elapsedSeconds, predictedMinutes: selected.durationMin, exposureIndex: selected.exposureIndex, feedback: value }))
    setStage('saved')
  }

  return (
    <section className="route-experience">
      <aside className="journey-panel">
        <JourneyProgress stage={stage} />
        {stage === 'setup' && <div className="journey-step">
          <span className="step-kicker">{workerMode === 'mia' ? 'MIA · ALBINISM + LOW VISION' : 'WORKER GUIDE'}</span><h1>What do you need?</h1><p>{workerMode === 'mia' ? 'Direct UV, glare, time and local Memory shape Mia’s eligible set.' : 'Change the brief. The eligible actions will change with it.'}</p>
          <label className="brief-composer"><span>JOURNEY BRIEF</span><textarea value={brief} onChange={(event) => { setBrief(event.target.value); resetForInput() }} rows={4}/></label>
          <div className="brief-understood"><span>UNDERSTOOD</span><div>{parsedBrief.chips.map((chip) => <b key={chip}>{chip}</b>)}</div></div>
          <button className="primary-action" onClick={findRoutes}>Find guided actions <ArrowRight size={18} /></button>
        </div>}

        {stage === 'results' && <div className="journey-step">
          <button className="back-action" onClick={() => setStage('setup')}><ArrowLeft size={15} /> Change brief</button><span className="step-kicker">STEP 2 OF 3</span><h1>{noEligible ? 'No eligible action yet.' : 'Choose an action.'}</h1><p>{noEligible ? 'A required constraint cannot yet be verified.' : `${routes.filter((route) => route.eligible).length} actions fit the brief`}</p>
          {noEligible ? <div className="honest-gap"><ShieldAlert /><div><strong>Required evidence unavailable</strong><span>{routes[0]?.reasons[0]}</span></div></div> : <div className="choice-list">{routes.map((route) => { const openPlaces = Math.max(0, route.remainingCapacity); return <button key={route.id} disabled={!route.eligible} onClick={() => setSelectedId(route.id)} className={`${selected.id === route.id ? 'is-selected' : ''} ${!route.eligible ? 'is-blocked' : ''}`}><i /><div><span>{route.recommended ? 'BEST FIT' : route.eligible ? 'ALTERNATIVE' : 'NOT ELIGIBLE'}</span><strong>{route.name}</strong><small>{route.eligible ? `${route.suggestedDelayMin ? `Leave in ${route.suggestedDelayMin} min` : 'Leave now'} · ${route.durationMin} min walk · ${openPlaces} ${openPlaces === 1 ? 'place' : 'places'} open` : route.reasons[0]}</small>{selected.id === route.id && route.eligible && <ul className="route-reasons">{route.reasons.slice(0, 3).map((reason) => <li key={reason}><Check size={12}/>{reason}</li>)}</ul>}</div>{selected.id === route.id && <Check size={17} />}</button> })}</div>}
          {!noEligible && <button className="primary-action" onClick={startJourney}>Start {selected.name} <Navigation size={18} /></button>}
        </div>}

        {stage === 'active' && <div className="journey-step active-journey">
          <span className="step-kicker live"><i /> ROUTE ACTIVE</span><h1>{selected.name}</h1><div className="active-time"><strong>{formatElapsed(elapsedSeconds)}</strong><span>actual elapsed time</span></div><div className="live-expectation"><Clock3/><span><small>EXPECTED</small><strong>{selected.durationMin} min · arrival by {parsedBrief.deadlineLabel}</strong></span></div><div className="next-turn"><Navigation /><div><span>NEXT · HIGH-CONTRAST + VIBRATION CUE</span><strong>Continue along Balmain Street</strong><small>enter the covered passage to reduce direct sun and glare</small></div></div><button className="primary-action" onClick={finishJourney}>I’ve arrived <Check size={18} /></button>
        </div>}

        {stage === 'feedback' && <div className="journey-step arrival-card">
          <div className="arrival-icon"><Check /></div><span className="step-kicker">OUTCOME CAPTURED</span><h1>Was this better?</h1><p>Your actual completion time is part of the outcome.</p><div className="arrival-metrics"><div><strong>{formatElapsed(elapsedSeconds)}</strong><span>actual elapsed</span></div><div><strong>{selected.durationMin}</strong><span>minutes predicted</span></div><div><strong>{selected.exposureIndex}</strong><span>UV load estimate</span></div></div><div className="feedback-row">{(['better', 'same', 'worse'] as const).map((value) => <button key={value} className={feedback === value ? 'is-active' : ''} onClick={() => recordFeedback(value)}>{value === 'better' ? 'Better' : value === 'same' ? 'Same' : 'Worse'}</button>)}</div>
        </div>}

        {stage === 'saved' && <div className="journey-step saved-card">
          <div className="arrival-icon"><BrainCircuit /></div><span className="step-kicker">PERSONAL MEMORY UPDATED</span><h1>The next recommendation starts smarter.</h1><p className="memory-next">A comparable journey can now retrieve today’s actual time, exposure estimate and your <strong>{feedback}</strong> result before ranking.</p><div className="saved-rule"><Navigation /><span>{selected.name} · {formatElapsed(elapsedSeconds)}</span><ArrowRight /><strong>Next eligible set</strong></div><button className="primary-action" onClick={resetForInput}>Plan another journey <ArrowRight size={18} /></button>
        </div>}
      </aside>

      <div className="journey-map">
        <CremorneMap routes={routes} selectedId={selected?.id} onSelect={(id) => { setSelectedId(id); if (stage === 'setup') setStage('results') }} showTrees />
        <div className="map-context"><span><Trees size={15} /> canopy</span><span><Users size={15} /> {workers} expected</span>{memoryActive && <span className="memory-on"><BrainCircuit size={15} /> local rule applied</span>}</div>
        {stage === 'active' && <div className="map-active-banner"><Navigation size={16} /><span>{formatElapsed(elapsedSeconds)} elapsed</span></div>}
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
  const [bookingStage, setBookingStage] = useState<'available' | 'held' | 'booked'>('available')
  const [holdRemaining, setHoldRemaining] = useState(300)
  const parsedDraft = useMemo(() => parseSpaceBrief(brief), [brief])
  const parsedBrief = useMemo(() => parseSpaceBrief(appliedBrief), [appliedBrief])
  const results = useMemo(() => findSpaces({ people: parsedBrief.people, requireHybrid: parsedBrief.requireHybrid, requireAccessible: parsedBrief.requireAccessible, requiredEquipment: parsedBrief.requiredEquipment, timeLabel: parsedBrief.timeLabel }), [parsedBrief])
  const eligibleSpaces = results.filter((space) => space.eligible)
  const selected = eligibleSpaces.find((space) => space.id === selectedId) ?? eligibleSpaces[0] ?? results[0]
  const chooseSpace = (id: string) => { setSelectedId(id); setBookingStage('available'); setHoldRemaining(300) }
  const searchSpaces = () => { setAppliedBrief(brief); setBookingStage('available'); setHoldRemaining(300) }
  const holdSlot = () => { setBookingStage('held'); setHoldRemaining(300) }

  useEffect(() => {
    if (bookingStage !== 'held') return
    const timer = window.setInterval(() => setHoldRemaining((value) => value > 0 ? value - 1 : 0), 1000)
    return () => window.clearInterval(timer)
  }, [bookingStage])

  return (
    <section className="space-experience">
      <aside className="space-search"><span className="step-kicker">{workerMode === 'mia' ? 'MIA’S WORKSPACE NEEDS' : 'WORKSPACE GUIDE'}</span><h1>What space do you need?</h1><p>{workerMode === 'mia' ? 'Sun control and low glare are part of eligibility.' : 'Describe the meeting, time and equipment.'}</p><label className="brief-composer"><span>SPACE BRIEF</span><textarea value={brief} onChange={(event) => setBrief(event.target.value)} rows={4}/></label><div className="brief-understood"><span>UNDERSTOOD</span><div>{parsedDraft.chips.map((chip) => <b key={chip}>{chip}</b>)}</div></div><button className="primary-action space-search-action" onClick={searchSpaces}>Find spaces <ArrowRight size={17}/></button><div className="space-match-count"><strong>{eligibleSpaces.length}</strong><span>eligible at {parsedBrief.timeLabel}</span></div>{eligibleSpaces.length > 0 ? <div className="choice-list space-choice-list">{eligibleSpaces.map((space) => <button key={space.id} onClick={() => chooseSpace(space.id)} className={selected.id === space.id ? 'is-selected' : ''}><i/><div><span>{space.accessClass === 'shared' ? 'SHARED SPACE' : 'INTERNAL SPACE'} · AVAILABLE</span><strong>{space.name.replace('CDH ', '')}</strong><small>{space.capacity} people · {space.availability.find((window) => window.startsWith(parsedBrief.timeLabel)) ?? space.availability[0]}</small></div><Check size={16}/></button>)}</div> : <div className="honest-gap"><ShieldAlert/><div><strong>No eligible space at {parsedBrief.timeLabel}</strong><span>Change the time or remove a non-essential requirement.</span></div></div>}</aside>
      <div className="space-canvas"><div className="space-floor-label">CDH · LEVEL 1</div>{results.map((space, index) => <button key={space.id} disabled={!space.eligible} onClick={() => chooseSpace(space.id)} className={`room-shape room-${index + 1} ${selected.id === space.id ? 'is-selected' : ''} ${space.eligible ? 'is-eligible' : 'is-blocked'}`}><Building2 /><strong>{space.name.replace('CDH ', '')}</strong><span>{space.capacity}</span></button>)}<div className="floor-corridor">SHARED CORRIDOR</div></div>
      <aside className="space-confirm"><span className="step-kicker">{selected.eligible ? `ELIGIBLE ${selected.accessClass.toUpperCase()} SPACE` : 'NOT A MATCH'}</span><h2>{selected.name}</h2><div className="capacity-number"><strong>{selected.capacity}</strong><span>people</span></div><div className="facility-list">{selected.facilities.map((facility) => <span key={facility}>{facility}</span>)}</div>{selected.eligible && bookingStage === 'available' && <><div className="booking-time"><Clock3 /><span><small>AVAILABLE AT REQUESTED TIME</small><strong>{parsedBrief.timeLabel} · {selected.accessClass === 'shared' ? 'shared access rules apply' : 'internal access'}</strong></span></div><button className="primary-action" onClick={holdSlot}>Hold for 5 minutes <ArrowRight size={18} /></button></>}{selected.eligible && bookingStage === 'held' && <div className="booking-flow"><div className="hold-clock"><Clock3/><span><small>SLOT HELD</small><strong>{formatElapsed(holdRemaining)} remaining</strong></span></div><p>Review the room, equipment and access class before booking.</p><button className="primary-action" onClick={() => setBookingStage('booked')}>Confirm room <Check size={18}/></button><button className="secondary-action" onClick={() => setBookingStage('available')}>Release hold</button></div>}{selected.eligible && bookingStage === 'booked' && <div className="booking-flow booking-complete"><div className="arrival-icon"><Check/></div><span className="step-kicker">ROOM BOOKED</span><strong>{parsedBrief.timeLabel} · {selected.name}</strong><p>{selected.accessClass === 'shared' ? 'Shared access instructions will activate five minutes before the booking.' : 'The room is reserved within your internal workspace.'}</p><button className="secondary-action" onClick={() => setBookingStage('available')}>Find another room</button></div>}{!selected.eligible && <div className="honest-gap"><ShieldAlert /><div><strong>Filtered by the brief</strong><span>{selected.blockers.join(' · ')}</span></div></div>}</aside>
    </section>
  )
}

function OperatorProgress({ stage }: { stage: OperatorStage }) {
  const current = stage === 'detect' ? 0 : stage === 'testing' ? 1 : stage === 'compare' ? 2 : 3
  return <div className="operator-progress">{['Define', 'Test', 'Measure', 'Publish'].map((label, index) => <div key={label} className={current >= index ? 'is-on' : ''}><i>{current > index ? <Check size={11}/> : index + 1}</i><span>{label}</span></div>)}</div>
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
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('ready')
  const predictedLoad = Math.min(99, Math.round(72 + parsedExperiment.workers / 15))
  const frictionMinutesRemoved = Math.round(parsedExperiment.workers * Math.abs(result.walkingDelta) / 100 * 10)
  const runTest = async () => {
    setStage('testing')
    setEngineStatus('running')
    const minimumRunTime = new Promise((resolve) => window.setTimeout(resolve, 1300))

    try {
      const response = await fetch(`/api/decision?need=standard&uv=${Math.max(8.2, weather.uvIndex)}&temperature=31&crowding=${predictedLoad}&workers=${parsedExperiment.workers}&seed=42&memory=0`)
      const contentType = response.headers.get('content-type') ?? ''
      if (!response.ok || !contentType.includes('application/json')) throw new Error('Decision API unavailable')
      const data = await response.json()
      setResult(data.experiment)
      setEngineStatus('api')
    } catch {
      setResult(simulateScenario(parsedExperiment.workers, 42))
      setEngineStatus('local')
    }

    await minimumRunTime
    setStage('compare')
  }
  const storeRule = () => { setMemory(saveRule(FIRST_EXCEPTION)); setStage('saved') }
  return (
    <main className="operator-clear">
      <header className="operator-heading"><div><span className="step-kicker">CDH EXPERIMENT LAB · CONTROLLED COMPARISON</span><h1>Measure an intervention before it becomes guidance.</h1></div><OperatorProgress stage={stage} /></header>
      <section className="operator-workbench">
        <div className={`operator-scene stage-${stage}`}>
          <div className="scene-top"><span><Activity size={15}/> {parsedExperiment.place}</span><span><Sun size={15}/> UV {Math.max(8.2, weather.uvIndex).toFixed(1)}</span><span><Users size={15}/> {parsedExperiment.workers} workers</span></div>
          <svg viewBox="0 0 780 420" role="img" aria-label="Intervention comparison across three routes"><path className="op-road road-a" d="M70 350 C220 270 310 225 430 195 S620 135 710 62"/><path className="op-road road-b" d="M70 350 C205 175 335 100 485 125 S620 108 710 62"/><path className="op-road road-c" d="M70 350 C220 360 350 330 470 270 S635 150 710 62"/>{stage === 'testing' && <circle className="op-traveller traveller-b" r="8"><animateMotion dur="2.1s" repeatCount="indefinite" path="M70 350 C205 175 335 100 485 125 S620 108 710 62"/></circle>}{stage === 'saved' && <circle className="op-traveller traveller-c" r="8"><animateMotion dur="2.6s" repeatCount="indefinite" path="M70 350 C220 360 350 330 470 270 S635 150 710 62"/></circle>}<g className="op-blocks"><rect x="190" y="280" width="95" height="67"/><rect x="360" y="155" width="105" height="72"/><rect x="545" y="75" width="92" height="70"/></g><g className="op-crowd">{Array.from({ length: 28 }).map((_, index) => <circle key={index} cx={95 + index * 18} cy={336 - index * 7 + (index % 3) * 8} r="5"/>)}</g><circle className="op-origin" cx="70" cy="350" r="13"/><circle className="op-target" cx="710" cy="62" r="13"/></svg>
          <div className="scene-legend"><span><i className="a"/>Accessible A</span><span><i className="b"/>Direct B</span><span><i className="c"/>Shadow C</span></div>
        </div>
        <aside className="operator-decision">
          {stage === 'detect' && <><span className="step-kicker">1 · DEFINE THE TEST</span><h2>What should CDH evaluate?</h2><label className="brief-composer operator-brief"><span>INTERVENTION BRIEF</span><textarea value={experimentBrief} onChange={(event) => setExperimentBrief(event.target.value)} rows={4}/></label><div className="brief-understood"><span>TEST DESIGN</span><div>{parsedExperiment.chips.map((chip) => <b key={chip}>{chip}</b>)}</div></div><div className="operator-signal operator-signal--compact"><strong>{predictedLoad}%</strong><span>predicted load · {parsedExperiment.horizonMin}-minute horizon</span></div><button className="primary-action" onClick={runTest}>Run controlled comparison <Play size={18}/></button></>}
          {stage === 'testing' && <div className="testing-state"><div className="testing-orb"><Activity/></div><span>RUNNING BASELINE VS INTERVENTION</span><h2>Same {parsedExperiment.workers} workers. Same UV. Same seed.</h2><p>Only the decision logic changes.</p></div>}
          {stage === 'compare' && <><span className="step-kicker">3 · MEASURED EFFECT</span><h2>The precinct improved. A guardrail failed.</h2><div className="result-pair"><div><span>PEAK CROWDING</span><strong>{percentDelta(result.crowdingDelta)}</strong><small>modelled change</small></div><div><span>FRICTION REMOVED</span><strong>{frictionMinutesRemoved}</strong><small>worker-minutes</small></div></div><div className="effectiveness-row"><span><small>AVG WALK TIME</small><strong>{percentDelta(result.walkingDelta)}</strong></span><span><small>CONFIDENCE</small><strong>{Math.round(FIRST_EXCEPTION.confidence * 100)}%</strong></span></div><div className="exception-found"><ShieldAlert/><div><span>GUARDRAIL FAILED</span><strong>Low-UV exposure {percentDelta(result.uvDeltaLowUv)}</strong><small>Mobility friction {percentDelta(result.mobilityFrictionDelta)}</small></div></div><p className="synthetic-label">Synthetic controlled MVP run</p><button className="primary-action" onClick={storeRule}>Adapt and publish rule <BrainCircuit size={18}/></button></>}
          {stage === 'saved' && <><div className="saved-badge"><BrainCircuit/></div><span className="step-kicker">4 · PUBLISHED TO MEMORY</span><h2>The measured exception now changes worker guidance.</h2><div className="operator-rule"><span>WHEN</span><strong>UV ≥ 7 + low-UV requirement</strong><span>THEN</span><strong>Filter Route B before ranking</strong></div><div className="published-impact"><Check/><span><strong>{memory.some((rule) => rule.id === FIRST_EXCEPTION.id) ? 'Operating rule active' : 'Rule saved'}</strong><small>{frictionMinutesRemoved} modelled friction minutes retained with its guardrail</small></span></div><button className="primary-action" onClick={onSeeWorker}>Open Worker Guide <ArrowRight size={18}/></button><button className="secondary-action" onClick={() => setStage('detect')}>Define another experiment</button></>}
        </aside>
      </section>
      <section className="technical-drawer" aria-label="How fragmented data becomes a guided action">
        <div><strong>FRAGMENTED SIGNALS</strong><span>weather · crowding · capacity · access</span></div><ArrowRight/>
        <div><strong>STRUCTURED BRIEF</strong><span>need · time · constraints · guardrails</span></div><ArrowRight/>
        <div><strong>GUIDE / TEST</strong><span>eligible action · controlled comparison</span></div><ArrowRight/>
        <div><strong>MEASURE + MEMORY</strong><span>outcome · exception · next prediction</span></div>
        <span className={`engine-status is-${engineStatus}`}>{engineStatus === 'api' ? 'Decision API verified' : engineStatus === 'running' ? 'Engine running' : engineStatus === 'local' ? 'Local engine verified' : 'Decision engine ready'}</span>
      </section>
    </main>
  )
}

export default function App() {
  return window.location.pathname.startsWith(PATHS.product) ? <ProductApp /> : <Landing />
}
