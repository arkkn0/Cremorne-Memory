import { useEffect, useMemo, useState } from 'react'
import {
  Activity, ArrowLeft, ArrowRight, BrainCircuit, Building2, Check, ChevronDown,
  CircleGauge, Clock3, ExternalLink, FlaskConical, Home, Map as MapIcon,
  Navigation, Play, Route, ShieldAlert, Sparkles, Sun, ThermometerSun, Trees, Users, X,
} from 'lucide-react'
import CremorneMap from './CremorneMap'
import { FIRST_EXCEPTION, simulateScenario } from './engine'
import { loadMemory, saveRule } from './memory'
import type { MemoryRule } from './domain'
import {
  demandAtTime, evaluateProductRoutes, findSpaces,
  type DestinationId, type ProductNeed,
} from './product'

type ProductRole = 'demo' | 'worker' | 'operator'
type WorkerTask = 'route' | 'space'
type JourneyStage = 'setup' | 'results' | 'active' | 'feedback' | 'saved'
type OperatorStage = 'detect' | 'testing' | 'compare' | 'saved'
type DemoStage = 'scenario' | 'first-pass' | 'reveal' | 'remembered'
type EngineStatus = 'ready' | 'running' | 'api' | 'local'

const PATHS = { landing: '/', product: '/app' }
const go = (path: string) => { window.location.href = path }
const percentDelta = (value: number) => `${value < 0 ? '−' : '+'}${Math.abs(value)}%`

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
          <button className="button button--ink" onClick={() => go(PATHS.product)}>Try live demo <ArrowRight size={17} /></button>
        </nav>
      </header>

      <section className="hero hero--product wrap">
        <div className="hero__copy">
          <p className="eyebrow"><span className="live-dot" /> CREMORNE MEMORY</p>
          <h1>Use the capacity <em>Cremorne already has.</em></h1>
          <p className="hero__lead">Match workers to usable routes and rooms—then turn every measured outcome into a smarter next decision.</p>
          <div className="hero__actions">
            <button className="button button--accent button--large" onClick={() => go(PATHS.product)}>Try live demo <ArrowRight size={19} /></button>
            <span className="no-login"><Check size={16}/> No login · starts immediately</span>
          </div>
        </div>

        <div className="hero__visual" aria-label="Cremorne with overloaded and spare capacity">
          <img src="/illustrations/cremorne-hero-unified.png" alt="A crowded exposed street beside a shaded passage and an underused meeting room" />
          <div className="hero-note hero-note--crowd">Overloaded now</div>
          <div className="hero-note hero-note--route">Underused capacity</div>
          <div className="hero-note hero-note--room">Usable for Mia</div>
        </div>
      </section>

      <section className="value-triad wrap" aria-label="How Cremorne Memory creates value">
        <article><span><Activity/></span><div><strong>Live State</strong><p>Crowding · UV · capacity</p></div></article>
        <article><span><CircleGauge/></span><div><strong>Capacity Graph</strong><p>Routes · rooms · time</p></div></article>
        <article><span><BrainCircuit/></span><div><strong>Memory</strong><p>Measured outcome → next decision</p></div></article>
      </section>

      <section className="landing-proof">
        <div className="wrap landing-proof__inner">
          <div><span>THE DIFFERENCE</span><strong>Prediction sees what may happen.<br/>Memory improves what happens next.</strong></div>
          <button className="button button--accent button--large" onClick={() => go(PATHS.product)}>Try live demo <ArrowRight size={19}/></button>
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
  const [memory, setMemory] = useState<MemoryRule[]>(() => loadMemory())
  const weather = useWeather()
  const demoWeather = { temperature: Math.max(31, weather.temperature), uvIndex: Math.max(8.2, weather.uvIndex), source: 'High-UV demo day' }
  return (
    <div className="product-clear">
      <header className="product-clear__header">
        <Brand />
        <div className="role-switch" role="group" aria-label="Choose product role">
          <button className={role === 'demo' ? 'is-active' : ''} onClick={() => setRole('demo')}><Sparkles size={16} /> Live demo</button>
          <button className={role === 'worker' ? 'is-active' : ''} onClick={() => setRole('worker')}><Users size={16} /> Worker app</button>
          <button className={role === 'operator' ? 'is-active' : ''} onClick={() => setRole('operator')}><FlaskConical size={16} /> CDH lab</button>
        </div>
        <div className="product-status"><span className={role === 'demo' || memory.length ? 'is-on' : ''}>{role === 'demo' ? <><Sparkles size={15}/>Guided proof</> : <><BrainCircuit size={15}/>{memory.length ? `${memory.length} local rule active` : 'No rule stored yet'}</>}</span><a href={PATHS.landing}><Home size={17} /><span>Story</span></a></div>
      </header>
      {role === 'demo' && <GuidedDemo setMemory={setMemory} onOpenWorker={() => { setRole('worker'); setTask('route') }} />}
      {role === 'worker' && <WorkerExperience task={task} setTask={setTask} weather={demoWeather} memoryActive={memory.length > 0} />}
      {role === 'operator' && <OperatorExperience weather={demoWeather} memory={memory} setMemory={setMemory} onSeeWorker={() => { setRole('worker'); setTask('route') }} />}
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
          <div className="mia-chip"><div>M</div><span><small>MIA · 1 OF 300 WORKERS</small><strong>Low UV · arrive by 4:20</strong></span></div>
          <svg viewBox="0 0 760 430" role="img" aria-label="Three route options changing across the Memory demonstration">
            <g className="demo-buildings"><rect x="155" y="272" width="112" height="84"/><rect x="335" y="185" width="116" height="86"/><rect x="530" y="87" width="105" height="82"/></g>
            <path className="demo-route route-a" d="M68 372 C190 312 272 270 365 236 S555 162 690 62"/>
            <path className="demo-route route-b" d="M68 372 C185 184 315 106 470 128 S610 108 690 62"/>
            <path className="demo-route route-c" d="M68 372 C205 388 326 350 451 289 S592 176 690 62"/>
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

function WorkerExperience({ task, setTask, weather, memoryActive }: {
  task: WorkerTask
  setTask: (task: WorkerTask) => void
  weather: { temperature: number; uvIndex: number; source: string }
  memoryActive: boolean
}) {
  return (
    <main className="worker-clear">
      <header className="task-switcher">
        <div><span>What do you need?</span><strong>{task === 'route' ? 'Get somewhere' : 'Find a workspace'}</strong></div>
        <div role="group" aria-label="Choose worker task"><button className={task === 'route' ? 'is-active' : ''} onClick={() => setTask('route')}><MapIcon size={17} /> Plan a route</button><button className={task === 'space' ? 'is-active' : ''} onClick={() => setTask('space')}><Building2 size={17} /> Find a room</button></div>
        <div className="live-context"><b>DEMO DAY</b><span><ThermometerSun size={15} />{weather.temperature.toFixed(0)}°</span><span><Sun size={15} />UV {weather.uvIndex.toFixed(1)}</span></div>
      </header>
      {task === 'route' ? <RouteJourney weather={weather} memoryActive={memoryActive} /> : <SpaceJourney />}
    </main>
  )
}

function JourneyProgress({ stage }: { stage: JourneyStage }) {
  const current = stage === 'setup' ? 0 : stage === 'results' ? 1 : 2
  return <div className="journey-progress" aria-label="Journey progress">{['Your need', 'Choose', 'Complete'].map((label, index) => <div key={label} className={current >= index ? 'is-on' : ''}><i>{current > index ? <Check size={11} /> : index + 1}</i><span>{label}</span></div>)}</div>
}

function RouteJourney({ weather, memoryActive }: { weather: { uvIndex: number }; memoryActive: boolean }) {
  const [stage, setStage] = useState<JourneyStage>('setup')
  const [destination, setDestination] = useState<DestinationId>('east-richmond')
  const [need, setNeed] = useState<ProductNeed>('lower-uv')
  const [departure, setDeparture] = useState('16:10')
  const [selectedId, setSelectedId] = useState<string>()
  const [progress, setProgress] = useState(16)
  const [feedback, setFeedback] = useState<'better' | 'same' | 'worse'>()
  const workers = demandAtTime(destination, departure)
  const routes = useMemo(() => evaluateProductRoutes({ destination, need, uvIndex: weather.uvIndex, workers, memoryActive }), [destination, need, weather.uvIndex, workers, memoryActive])
  const selected = routes.find((route) => route.id === selectedId && route.eligible) ?? routes.find((route) => route.eligible) ?? routes[0]
  const noEligible = routes.every((route) => !route.eligible)

  useEffect(() => {
    if (stage !== 'active') return
    const timer = window.setInterval(() => setProgress((value) => Math.min(88, value + 7)), 700)
    return () => window.clearInterval(timer)
  }, [stage])

  const resetForInput = () => { setStage('setup'); setSelectedId(undefined); setProgress(16); setFeedback(undefined) }
  const findRoutes = () => { setSelectedId(routes.find((route) => route.eligible)?.id); setStage('results') }

  return (
    <section className="route-experience">
      <aside className="journey-panel">
        <JourneyProgress stage={stage} />
        {stage === 'setup' && <div className="journey-step">
          <span className="step-kicker">STEP 1 OF 3</span><h1>What matters for this trip?</h1><p>We will only show options that fit your requirement at the time you arrive.</p>
          <div className="journey-fields"><label><span>From</span><strong>CDH · 80 Balmain St</strong></label><label><span>To</span><select value={destination} onChange={(event) => { setDestination(event.target.value as DestinationId); resetForInput() }}><option value="east-richmond">East Richmond Station</option><option value="richmond">Richmond Station</option></select></label><label><span>Leave at</span><input type="time" value={departure} onChange={(event) => { setDeparture(event.target.value); resetForInput() }} /></label></div>
          <span className="field-title">Your requirement</span><div className="need-cards"><button className={need === 'lower-uv' ? 'is-active' : ''} onClick={() => { setNeed('lower-uv'); resetForInput() }}><Sun /><strong>Low UV</strong><span>Reduce direct exposure</span></button><button className={need === 'fastest' ? 'is-active' : ''} onClick={() => { setNeed('fastest'); resetForInput() }}><Route /><strong>Fastest</strong><span>Minimise travel time</span></button><button className={need === 'step-free' ? 'is-active' : ''} onClick={() => { setNeed('step-free'); resetForInput() }}><ShieldAlert /><strong>Step-free</strong><span>Verified access only</span></button></div>
          <button className="primary-action" onClick={findRoutes}>Find eligible routes <ArrowRight size={18} /></button>
          <small className="input-note"><Sparkles size={13} /> Forecast + arrival capacity + your requirement</small>
        </div>}

        {stage === 'results' && <div className="journey-step">
          <button className="back-action" onClick={() => setStage('setup')}><ArrowLeft size={15} /> Change trip</button><span className="step-kicker">STEP 2 OF 3</span><h1>{noEligible ? 'We need better evidence.' : 'Choose your route.'}</h1><p>{noEligible ? 'We will not claim a verified step-free route until kerb, crossing and gradient data is complete.' : `${routes.filter((route) => route.eligible).length} options fit this journey. Recommended does not mean required.`}</p>
          {noEligible ? <div className="honest-gap"><ShieldAlert /><div><strong>No verified match</strong><span>Accessibility evidence gap flagged for CDH.</span></div></div> : <div className="choice-list">{routes.map((route) => <button key={route.id} disabled={!route.eligible} onClick={() => setSelectedId(route.id)} className={`${selected.id === route.id ? 'is-selected' : ''} ${!route.eligible ? 'is-blocked' : ''}`}><i /><div><span>{route.recommended ? 'BEST FIT' : route.eligible ? 'ALTERNATIVE' : 'NOT ELIGIBLE'}</span><strong>{route.name}</strong><small>{route.durationMin} min · UV load {route.exposureIndex} · {Math.max(0, route.remainingCapacity)} places open</small></div>{selected.id === route.id && <Check size={17} />}</button>)}</div>}
          {!noEligible && <><details className="inline-evidence"><summary>Why this route? <ChevronDown size={15} /></summary><ul>{selected.reasons.map((reason) => <li key={reason}><Check size={13} />{reason}</li>)}</ul><small>Public geometry + forecast + modelled arrival demand</small></details><button className="primary-action" onClick={() => setStage('active')}>Start {selected.name} <Navigation size={18} /></button></>}
        </div>}

        {stage === 'active' && <div className="journey-step active-journey">
          <span className="step-kicker live"><i /> ROUTE ACTIVE</span><h1>{selected.name}</h1><p>Follow the highlighted route. We are monitoring the arrival state, not your identity.</p><div className="active-time"><strong>{Math.max(1, Math.ceil(selected.durationMin * (100 - progress) / 100))}</strong><span>minutes remaining</span></div><div className="trip-progress"><i style={{ width: `${progress}%` }} /></div><div className="next-turn"><Navigation /><div><span>NEXT</span><strong>Continue along Balmain Street</strong><small>towards the shaded passage</small></div></div><button className="primary-action" onClick={() => setStage('feedback')}>I’ve arrived <Check size={18} /></button>
        </div>}

        {stage === 'feedback' && <div className="journey-step arrival-card">
          <div className="arrival-icon"><Check /></div><span className="step-kicker">JOURNEY COMPLETE</span><h1>Was this better?</h1><p>Your answer improves similar recommendations. It does not require a diagnosis or identity record.</p><div className="arrival-metrics"><div><strong>{selected.durationMin}</strong><span>minutes</span></div><div><strong>{selected.exposureIndex}</strong><span>UV load</span></div><div><strong>{Math.max(0, selected.remainingCapacity)}</strong><span>spare capacity</span></div></div><div className="feedback-row">{(['better', 'same', 'worse'] as const).map((value) => <button key={value} className={feedback === value ? 'is-active' : ''} onClick={() => { setFeedback(value); setStage('saved') }}>{value === 'better' ? 'Better' : value === 'same' ? 'Same' : 'Worse'}</button>)}</div>
        </div>}

        {stage === 'saved' && <div className="journey-step saved-card">
          <div className="arrival-icon"><BrainCircuit /></div><span className="step-kicker">SAVED ON THIS DEVICE</span><h1>The next similar choice starts smarter.</h1><p>Personal preference: <strong>{feedback}</strong>. Precinct-wide rules are only created after CDH validates outcomes across users.</p><div className="saved-rule"><Sun /><span>Low-UV journey</span><ArrowRight /><strong>{selected.name}</strong></div><button className="primary-action" onClick={() => { setStage('setup'); setProgress(16); setFeedback(undefined) }}>Plan another journey <ArrowRight size={18} /></button>
        </div>}
      </aside>

      <div className="journey-map">
        <CremorneMap routes={routes} selectedId={selected?.id} onSelect={(id) => { setSelectedId(id); if (stage === 'setup') setStage('results') }} showTrees />
        <div className="map-context"><span><Trees size={15} /> canopy</span><span><Users size={15} /> {workers} expected</span>{memoryActive && <span className="memory-on"><BrainCircuit size={15} /> local rule applied</span>}</div>
        {stage === 'active' && <div className="map-active-banner"><Navigation size={16} /><span>{progress}% complete</span></div>}
      </div>
    </section>
  )
}

function SpaceJourney() {
  const [people, setPeople] = useState(6)
  const [hybrid, setHybrid] = useState(true)
  const [accessible, setAccessible] = useState(true)
  const [selectedId, setSelectedId] = useState('boardroom')
  const [held, setHeld] = useState(false)
  const results = useMemo(() => findSpaces({ people, requireHybrid: hybrid, requireAccessible: accessible }), [people, hybrid, accessible])
  const selected = results.find((space) => space.id === selectedId) ?? results[0]
  const chooseSpace = (id: string) => { setSelectedId(id); setHeld(false) }
  return (
    <section className="space-experience">
      <aside className="space-search"><span className="step-kicker">WORKSPACE CAPACITY</span><h1>Find a room you can actually use.</h1><p>Searches opted-in capacity only. Private calendars and meeting details stay private.</p><label><span>People</span><div><input type="range" min="2" max="80" value={people} onChange={(event) => { setPeople(Number(event.target.value)); setHeld(false) }} /><strong>{people}</strong></div></label><div className="space-toggles"><button className={hybrid ? 'is-active' : ''} onClick={() => { setHybrid((value) => !value); setHeld(false) }}><Check /> Hybrid equipped</button><button className={accessible ? 'is-active' : ''} onClick={() => { setAccessible((value) => !value); setHeld(false) }}><Check /> Accessible</button></div><div className="space-match-count"><strong>{results.filter((space) => space.eligible).length}</strong><span>eligible now</span></div><div className="choice-list space-choice-list">{results.map((space) => <button key={space.id} disabled={!space.eligible} onClick={() => chooseSpace(space.id)} className={`${selected.id === space.id ? 'is-selected' : ''} ${!space.eligible ? 'is-blocked' : ''}`}><i/><div><span>{space.eligible ? 'AVAILABLE' : 'FILTERED'}</span><strong>{space.name.replace('CDH ', '')}</strong><small>{space.capacity} people · {space.availability[0] ?? space.blockers[0]}</small></div>{space.eligible ? <Check size={16}/> : <X size={16}/>}</button>)}</div></aside>
      <div className="space-canvas"><div className="space-floor-label">CDH · LEVEL 1</div>{results.map((space, index) => <button key={space.id} onClick={() => chooseSpace(space.id)} className={`room-shape room-${index + 1} ${selected.id === space.id ? 'is-selected' : ''} ${space.eligible ? 'is-eligible' : 'is-blocked'}`}><Building2 /><strong>{space.name.replace('CDH ', '')}</strong><span>{space.capacity}</span></button>)}<div className="floor-corridor">SHARED CORRIDOR</div></div>
      <aside className="space-confirm"><span className="step-kicker">{selected.eligible ? 'ELIGIBLE SPACE' : 'NOT A MATCH'}</span><h2>{selected.name}</h2><div className="capacity-number"><strong>{selected.capacity}</strong><span>people</span></div><div className="facility-list">{selected.facilities.map((facility) => <span key={facility}>{facility}</span>)}</div>{selected.eligible ? <><div className="booking-time"><Clock3 /><span><small>AVAILABLE</small><strong>{selected.availability[0]}</strong></span></div><button className={`primary-action ${held ? 'is-confirmed' : ''}`} onClick={() => setHeld(true)}>{held ? <><Check /> Slot held for this demo</> : <>Hold this slot <ArrowRight size={18} /></>}</button></> : <div className="honest-gap"><ShieldAlert /><div><strong>Filtered by your requirements</strong><span>{selected.blockers.join(' · ')}</span></div></div>}<details className="inline-evidence"><summary>What the host shares <ChevronDown size={15}/></summary><p>Availability, capacity, facilities, access class and optional price—no meeting titles or attendees.</p></details></aside>
    </section>
  )
}

function OperatorProgress({ stage }: { stage: OperatorStage }) {
  const current = stage === 'detect' ? 0 : stage === 'testing' ? 1 : stage === 'compare' ? 2 : 3
  return <div className="operator-progress">{['Detect', 'Test', 'Compare', 'Save rule'].map((label, index) => <div key={label} className={current >= index ? 'is-on' : ''}><i>{current > index ? <Check size={11}/> : index + 1}</i><span>{label}</span></div>)}</div>
}

function OperatorExperience({ weather, memory, setMemory, onSeeWorker }: {
  weather: { uvIndex: number }
  memory: MemoryRule[]
  setMemory: (memory: MemoryRule[]) => void
  onSeeWorker: () => void
}) {
  const [stage, setStage] = useState<OperatorStage>(memory.length ? 'saved' : 'detect')
  const [technicalOpen, setTechnicalOpen] = useState(false)
  const [result, setResult] = useState(() => simulateScenario(300, 42))
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('ready')
  const runTest = async () => {
    setStage('testing')
    setEngineStatus('running')
    const minimumRunTime = new Promise((resolve) => window.setTimeout(resolve, 1300))

    try {
      const response = await fetch('/api/decision?need=standard&uv=8.2&temperature=31&crowding=82&workers=300&seed=42&memory=0')
      const contentType = response.headers.get('content-type') ?? ''
      if (!response.ok || !contentType.includes('application/json')) throw new Error('Decision API unavailable')
      const data = await response.json()
      setResult(data.experiment)
      setEngineStatus('api')
    } catch {
      setResult(simulateScenario(300, 42))
      setEngineStatus('local')
    }

    await minimumRunTime
    setStage('compare')
  }
  const storeRule = () => { setMemory(saveRule(FIRST_EXCEPTION)); setStage('saved') }
  return (
    <main className="operator-clear">
      <header className="operator-heading"><div><span className="step-kicker">CDH OPERATIONS</span><h1>Test one decision before it reaches the precinct.</h1></div><OperatorProgress stage={stage} /></header>
      <section className="operator-workbench">
        <div className={`operator-scene stage-${stage}`}>
          <div className="scene-top"><span><Activity size={15}/> Church Street</span><span><Sun size={15}/> UV {Math.max(8.2, weather.uvIndex).toFixed(1)}</span><span><Users size={15}/> 300 workers</span></div>
          <svg viewBox="0 0 780 420" role="img" aria-label="Intervention comparison across three routes"><path className="op-road road-a" d="M70 350 C220 270 310 225 430 195 S620 135 710 62"/><path className="op-road road-b" d="M70 350 C205 175 335 100 485 125 S620 108 710 62"/><path className="op-road road-c" d="M70 350 C220 360 350 330 470 270 S635 150 710 62"/><g className="op-blocks"><rect x="190" y="280" width="95" height="67"/><rect x="360" y="155" width="105" height="72"/><rect x="545" y="75" width="92" height="70"/></g><g className="op-crowd">{Array.from({ length: 28 }).map((_, index) => <circle key={index} cx={95 + index * 18} cy={336 - index * 7 + (index % 3) * 8} r="5"/>)}</g><circle className="op-origin" cx="70" cy="350" r="13"/><circle className="op-target" cx="710" cy="62" r="13"/></svg>
          <div className="scene-legend"><span><i className="a"/>Accessible A</span><span><i className="b"/>Direct B</span><span><i className="c"/>Shadow C</span></div>
        </div>
        <aside className="operator-decision">
          {stage === 'detect' && <><span className="step-kicker">1 · DETECTED</span><h2>Church Street reaches 92% load in 15 minutes.</h2><p>Question: can demand be redistributed without making another worker’s journey worse?</p><div className="operator-signal"><strong>92%</strong><span>predicted route load</span></div><button className="primary-action" onClick={runTest}>Test redistribution <Play size={18}/></button></>}
          {stage === 'testing' && <div className="testing-state"><div className="testing-orb"><Activity/></div><span>RUNNING CONTROLLED TEST</span><h2>Same demand. Same UV. Same seed.</h2><p>Only the decision logic changes.</p></div>}
          {stage === 'compare' && <><span className="step-kicker">3 · COMPARE</span><h2>The average improved. One group did not.</h2><div className="result-pair"><div><span>CROWDING</span><strong>{percentDelta(result.crowdingDelta)}</strong><small>better</small></div><div><span>WALK TIME</span><strong>{percentDelta(result.walkingDelta)}</strong><small>better</small></div></div><div className="exception-found"><ShieldAlert/><div><span>EXCEPTION FOUND</span><strong>Low-UV exposure {percentDelta(result.uvDeltaLowUv)}</strong><small>Route B cannot be reused universally.</small></div></div><button className="primary-action" onClick={storeRule}>Adapt and save rule <BrainCircuit size={18}/></button></>}
          {stage === 'saved' && <><div className="saved-badge"><BrainCircuit/></div><span className="step-kicker">4 · RULE READY</span><h2>Next high-UV day starts with the exception.</h2><div className="operator-rule"><span>WHEN</span><strong>UV ≥ 7 + low-UV requirement</strong><span>THEN</span><strong>Filter Route B before ranking</strong></div><button className="primary-action" onClick={onSeeWorker}>See the worker result <ArrowRight size={18}/></button><button className="secondary-action" onClick={() => setStage('detect')}>Replay from detection</button></>}
          <button className="technical-toggle" onClick={() => setTechnicalOpen((open) => !open)}><CircleGauge size={15}/>{technicalOpen ? 'Hide' : 'Show'} decision trace <ChevronDown size={14}/></button>
        </aside>
      </section>
      {technicalOpen && <section className="technical-drawer"><div><strong>OBSERVE</strong><span>public + forecast inputs</span></div><ArrowRight/><div><strong>PREDICT</strong><span>arrival-state load</span></div><ArrowRight/><div><strong>MATCH</strong><span>capacity + constraints</span></div><ArrowRight/><div><strong>MEASURE</strong><span>average + cohort effects</span></div><ArrowRight/><div><strong>REMEMBER</strong><span>exception + boundary</span></div><a href="/api/decision?need=low-uv&memory=1" target="_blank" rel="noreferrer">API JSON <ExternalLink size={13}/></a><span className={`engine-status is-${engineStatus}`}>{engineStatus === 'api' ? 'API verified' : engineStatus === 'running' ? 'Engine running' : engineStatus === 'local' ? 'Local engine verified' : 'Engine ready'}</span></section>}
      <p className="synthetic-footnote">Synthetic MVP experiment. Reported effects demonstrate the measurement workflow and are not field-validated claims.</p>
    </main>
  )
}

export default function App() {
  return window.location.pathname.startsWith(PATHS.product) ? <ProductApp /> : <Landing />
}
