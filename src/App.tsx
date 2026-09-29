import { useEffect, useMemo, useState } from 'react'
import {
  Activity, ArrowRight, BookOpenCheck, BrainCircuit, Building2, Check, ChevronRight,
  CircleGauge, Database, ExternalLink, FlaskConical, Layers3, Map as MapIcon, Play,
  RotateCcw, Route, ServerCog, ShieldAlert, Sparkles, Sun, ThermometerSun, Trees, Users, X,
} from 'lucide-react'
import CremorneMap from './CremorneMap'
import { FIRST_EXCEPTION, simulateScenario } from './engine'
import { clearMemory, loadMemory, saveRule } from './memory'
import type { MemoryRule } from './domain'
import {
  demandAtTime, evaluateProductRoutes, findSpaces, productContext,
  type DestinationId, type ProductNeed,
} from './product'

type AppView = 'worker' | 'lab' | 'spaces' | 'memory'
type LabPhase = 'ready' | 'measured' | 'stored' | 'replayed'

const PATHS = { landing: '/', product: '/app' }
const go = (path: string) => { window.location.href = path }

function Brand({ dark = false }: { dark?: boolean }) {
  return (
    <a className={`brand ${dark ? 'brand--dark' : ''}`} href={PATHS.landing} aria-label="Cremorne Memory home">
      <span className="brand__mark"><span /><span /><span /></span>
      <span>Cremorne <strong>Memory</strong></span>
    </a>
  )
}

function Landing() {
  return (
    <main className="landing">
      <header className="landing-nav wrap">
        <Brand />
        <div className="landing-nav__links">
          <a href="#how">How it works</a>
          <a href="#proof">Why it matters</a>
          <button className="button button--ink" onClick={() => go(PATHS.product)}>Try the product <ArrowRight size={17} /></button>
        </div>
      </header>

      <section className="hero wrap">
        <div className="hero__copy">
          <p className="eyebrow"><span className="live-dot" /> Built for one square kilometre of Cremorne</p>
          <h1>The capacity is already here. <em>Cremorne just cannot see it together.</em></h1>
          <p className="hero__lead">Cremorne Memory predicts where the working day will tighten, matches people to capacity they can actually use, and remembers the measured result.</p>
          <div className="hero__actions">
            <button className="button button--accent button--large" onClick={() => go(PATHS.product)}>Try Cremorne Memory <ArrowRight size={19} /></button>
            <a className="text-link" href="#proof">See the learning moment <ChevronRight size={16} /></a>
          </div>
          <div className="hero__facts" aria-label="Cremorne facts">
            <div><strong>700+</strong><span>businesses</span></div>
            <div><strong>10,000+</strong><span>workers</span></div>
            <div><strong>&lt;1 km²</strong><span>one shared precinct</span></div>
          </div>
        </div>

        <div className="hero__visual" aria-label="Illustrated Cremorne capacity problem">
          <img src="/illustrations/cremorne-capacity-reframe.png" alt="Hand-drawn Cremorne scene showing a crowded exposed street, a covered route and spare indoor capacity" />
          <div className="hero-note hero-note--crowd">Overloaded now</div>
          <div className="hero-note hero-note--route">Usable at 4:10pm</div>
          <div className="hero-note hero-note--room">Available ≠ usable</div>
          <div className="hero-graph"><span>PLACE</span><ArrowRight size={15} /><strong>CAPACITY × TIME × RULES</strong></div>
        </div>
      </section>

      <section className="product-window wrap" aria-label="Cremorne Memory product preview">
        <div className="product-window__chrome">
          <span /><span /><span /><small>LIVE PRODUCT PREVIEW</small>
          <button onClick={() => go(PATHS.product)}>Open prototype <ArrowRight size={15} /></button>
        </div>
        <div className="preview-layout">
          <div className="preview-sidebar">
            <div className="preview-logo">CM</div>
            <span className="is-on"><MapIcon size={18} /> Worker map</span>
            <span><FlaskConical size={18} /> Precinct lab</span>
            <span><Building2 size={18} /> Spaces</span>
            <span><BrainCircuit size={18} /> Memory</span>
          </div>
          <div className="preview-map">
            <svg viewBox="0 0 720 360" role="img" aria-label="Route preview from Cremorne Digital Hub to East Richmond">
              <path className="preview-road" d="M20 80 L700 80 M90 10 L90 340 M270 10 L270 340 M510 10 L510 340 M20 235 L700 235" />
              <path className="preview-block" d="M115 105h125v102H115z M300 105h180v102H300z M535 105h130v102H535z M115 260h125v62H115z M300 260h180v62H300z M535 260h130v62H535z" />
              <path className="preview-route preview-route--a" d="M70 285 C180 248 210 165 330 170 S510 236 650 65" />
              <path className="preview-route preview-route--b" d="M70 285 C170 260 245 240 345 226 S530 148 650 65" />
              <path className="preview-route preview-route--c" d="M70 285 C155 195 230 125 350 130 S530 120 650 65" />
              <circle cx="70" cy="285" r="10" className="preview-origin" /><circle cx="650" cy="65" r="10" className="preview-destination" />
              <g className="preview-trees"><circle cx="208" cy="125" r="9" /><circle cx="350" cy="110" r="11" /><circle cx="455" cy="120" r="8" /><circle cx="565" cy="100" r="10" /></g>
            </svg>
            <div className="preview-map__label">Public routes + tree canopy + predicted demand</div>
          </div>
          <div className="preview-decision">
            <p className="mini-label">MIA · 4:10 PM</p><h3>Lower UV is required.</h3>
            <div className="preview-route-card is-best"><span>Canopy alternative</span><strong>9 min</strong><small>28% canopy-adjacent · 18 places remain</small></div>
            <div className="preview-route-card is-blocked"><span>Direct route</span><strong>Filtered</strong><small>Stored high-UV exception</small></div>
            <div className="preview-evidence"><BookOpenCheck size={17} /> Memory changed this decision</div>
          </div>
        </div>
      </section>

      <section className="mechanism wrap" id="how">
        <div className="section-intro"><p className="eyebrow">ONE OPERATING LOOP</p><h2>From scattered signals to a better next decision.</h2></div>
        <div className="mechanism__rail">
          <article><span>01</span><Activity /><h3>See the state</h3><p>Weather, public movement baselines, route geometry and participating capacity.</p></article><ArrowRight className="rail-arrow" />
          <article><span>02</span><CircleGauge /><h3>Predict the pinch</h3><p>Estimate demand, exposure and remaining capacity at the time of use.</p></article><ArrowRight className="rail-arrow" />
          <article><span>03</span><Layers3 /><h3>Match what is usable</h3><p>Access, time and functional needs determine the eligible set.</p></article><ArrowRight className="rail-arrow" />
          <article><span>04</span><BrainCircuit /><h3>Measure, then remember</h3><p>Outcomes become local rules, including the boundary where success failed.</p></article>
        </div>
      </section>

      <section className="aha wrap" id="proof">
        <div className="section-intro section-intro--center"><p className="eyebrow">THE LEARNING MOMENT</p><h2>A result can look successful—until you see who carried the cost.</h2></div>
        <div className="aha__story">
          <article className="story-card">
            <img src="/illustrations/mia-before.png" alt="Mia facing a hot crowded route" /><span className="story-step">FIRST PASS</span><h3>Route B looks best.</h3>
            <div className="story-metrics"><strong>−20%</strong> crowding <strong>−7%</strong> walking time</div>
          </article>
          <div className="aha__turn"><span>WHO DID WE MISS?</span><ArrowRight /></div>
          <article className="story-card story-card--reveal">
            <div className="cohort-alert"><Sun /><div><strong>+40%</strong><span>UV exposure · low-UV cohort</span></div></div>
            <div className="cohort-alert"><Route /><div><strong>+15%</strong><span>travel friction · mobility cohort</span></div></div>
            <span className="story-step">MEASURED · SYNTHETIC MVP OUTPUT</span><h3>Success has a boundary.</h3>
          </article>
          <div className="aha__turn"><span>MEMORY WRITES THE EXCEPTION</span><ArrowRight /></div>
          <article className="story-card">
            <img src="/illustrations/mia-after.png" alt="Mia receiving a lower UV route after Memory retrieves the exception" /><span className="story-step">NEXT PASS</span><h3>Cremorne has seen this before.</h3>
            <div className="memory-rule">High UV + low-UV need → filter Route B</div>
          </article>
        </div>
        <p className="synthetic-note">Run this controlled experiment, inspect the backend decision trace, store the exception and replay the same conditions.</p>
      </section>

      <section className="landing-cta"><div className="wrap landing-cta__inner"><div><p className="eyebrow">WORKING PROTOTYPE</p><h2>Use what Cremorne already has.<br />Make the next decision better.</h2></div><button className="button button--accent button--large" onClick={() => go(PATHS.product)}>Try the product <ArrowRight size={19} /></button></div></section>
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

function StatusChip({ type, children }: { type: 'live' | 'public' | 'model' | 'gap'; children: React.ReactNode }) {
  return <span className={`status-chip status-chip--${type}`}>{children}</span>
}

function ProductApp() {
  const [view, setView] = useState<AppView>('worker')
  const [memory, setMemory] = useState<MemoryRule[]>(() => loadMemory())
  const weather = useWeather()
  const nav = [
    { id: 'worker' as const, label: 'Worker map', icon: MapIcon }, { id: 'lab' as const, label: 'Precinct lab', icon: FlaskConical },
    { id: 'spaces' as const, label: 'Spaces', icon: Building2 }, { id: 'memory' as const, label: 'Memory', icon: BrainCircuit },
  ]
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Brand dark />
        <nav aria-label="Product">{nav.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? 'is-active' : ''} onClick={() => setView(id)}><Icon size={19} /><span>{label}</span></button>)}</nav>
        <div className="app-sidebar__memory"><span className={memory.length ? 'memory-pulse is-active' : 'memory-pulse'} /><div><strong>{memory.length ? 'Memory active' : 'Memory empty'}</strong><small>{memory.length} local rule{memory.length === 1 ? '' : 's'}</small></div></div>
        <a className="back-link" href={PATHS.landing}>About the project <ExternalLink size={14} /></a>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <div className="app-topbar__mobile"><Brand dark /></div>
          <div className="signal-strip">
            <span><ThermometerSun size={16} /><strong>{weather.temperature.toFixed(1)}°</strong><StatusChip type={weather.source.includes('Open-Meteo') ? 'live' : 'model'}>{weather.source}</StatusChip></span>
            <span><Sun size={16} /><strong>UV {weather.uvIndex.toFixed(1)}</strong><StatusChip type={weather.source.includes('Open-Meteo') ? 'live' : 'model'}>{weather.source.includes('Open-Meteo') ? 'FORECAST' : 'SCENARIO'}</StatusChip></span>
            <span><Users size={16} /><strong>4,400 PM peak</strong><StatusChip type="public">DTP FY24–25</StatusChip></span>
          </div>
          <button className="mini-button" onClick={() => setView('lab')}><Play size={15} /> Run experiment</button>
        </header>
        {view === 'worker' && <WorkerView weather={weather} memoryActive={memory.length > 0} onOpenLab={() => setView('lab')} />}
        {view === 'lab' && <LabView memory={memory} setMemory={setMemory} weather={weather} onOpenMemory={() => setView('memory')} />}
        {view === 'spaces' && <SpacesView />}
        {view === 'memory' && <MemoryView memory={memory} onClear={() => { clearMemory(); setMemory([]) }} onOpenLab={() => setView('lab')} />}
      </div>
      <nav className="mobile-nav" aria-label="Product mobile navigation">{nav.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? 'is-active' : ''} onClick={() => setView(id)}><Icon size={20} /><span>{label}</span></button>)}</nav>
    </div>
  )
}

function WorkerView({ weather, memoryActive, onOpenLab }: { weather: { temperature: number; uvIndex: number }; memoryActive: boolean; onOpenLab: () => void }) {
  const [destination, setDestination] = useState<DestinationId>('east-richmond')
  const [need, setNeed] = useState<ProductNeed>('lower-uv')
  const [departure, setDeparture] = useState('16:10')
  const [showTrees, setShowTrees] = useState(true)
  const workers = demandAtTime(destination, departure)
  const routes = useMemo(() => evaluateProductRoutes({ destination, need, uvIndex: weather.uvIndex, workers, memoryActive }), [destination, need, weather.uvIndex, workers, memoryActive])
  const [selectedId, setSelectedId] = useState<string>()
  const selected = routes.find((route) => route.id === selectedId) ?? routes[0]
  const noEligible = routes.every((route) => !route.eligible)
  const station = productContext.places[destination]
  useEffect(() => setSelectedId(undefined), [destination, need, memoryActive])
  return (
    <section className="workspace worker-workspace">
      <div className="view-heading"><div><p className="view-kicker">WORKER DECISION</p><h1>Find capacity that fits the person and the moment.</h1></div><div className="evidence-legend"><StatusChip type="live">LIVE</StatusChip><StatusChip type="public">PUBLIC BASELINE</StatusChip><StatusChip type="model">MODELLED</StatusChip></div></div>
      <div className="worker-grid">
        <div className="route-planner">
          <div className="planner-fields">
            <label><span>From</span><select value="cdh" disabled><option value="cdh">Cremorne Digital Hub</option></select></label>
            <label><span>To</span><select value={destination} onChange={(event) => setDestination(event.target.value as DestinationId)}><option value="east-richmond">East Richmond Station</option><option value="richmond">Richmond Station</option></select></label>
            <label><span>Leave at</span><input type="time" value={departure} onChange={(event) => setDeparture(event.target.value)} /></label>
          </div>
          <div className="need-selector" role="group" aria-label="Route need">
            <button className={need === 'lower-uv' ? 'is-selected' : ''} onClick={() => setNeed('lower-uv')}><Sun size={17} /> Lower UV</button>
            <button className={need === 'fastest' ? 'is-selected' : ''} onClick={() => setNeed('fastest')}><Route size={17} /> Fastest</button>
            <button className={need === 'step-free' ? 'is-selected' : ''} onClick={() => setNeed('step-free')}><ShieldAlert size={17} /> Step-free</button>
          </div>
          {noEligible ? (
            <div className="coverage-gap" role="alert"><ShieldAlert /><div><span>Evidence gap—not a recommendation</span><h3>No verified step-free route in the current dataset.</h3><p>Crossing, kerb and gradient data must be validated before this need can be safely served.</p></div></div>
          ) : (
            <div className="route-list" aria-live="polite">{routes.map((route) => (
              <button key={route.id} className={`route-option ${selected.id === route.id ? 'is-selected' : ''} ${!route.eligible ? 'is-blocked' : ''}`} onClick={() => setSelectedId(route.id)}>
                <div className="route-option__top"><span>{route.recommended ? 'RECOMMENDED' : route.eligible ? 'ELIGIBLE' : 'FILTERED'}</span><strong>{route.durationMin} min</strong></div><h3>{route.name}</h3>
                <div className="route-option__metrics"><span><Trees size={14} /> {route.canopyAdjacentPct}% canopy</span><span><Users size={14} /> {Math.max(0, route.remainingCapacity)} remain</span><span><Sun size={14} /> exposure {route.exposureIndex}</span></div><p>{route.reasons[0]}</p>
              </button>))}</div>
          )}
        </div>
        <div className="map-stage">
          <CremorneMap routes={routes} selectedId={selected?.id} onSelect={setSelectedId} showTrees={showTrees} />
          <div className="map-toolbar"><button className={showTrees ? 'is-on' : ''} onClick={() => setShowTrees((value) => !value)}><Trees size={16} /> Urban trees</button><span>{station.pmPeakEntries?.toLocaleString()} PM-peak station entries</span></div>
          <div className="map-source">Route geometry © OpenStreetMap via Valhalla · trees © State of Victoria</div>
        </div>
        <aside className="decision-panel">
          {noEligible ? <><p className="mini-label">CURRENT DECISION</p><h2>Hold the recommendation.</h2><p className="decision-summary">The system exposes the missing evidence instead of turning an unverified route into false certainty.</p><StatusChip type="gap">WHO THIS DATA DOES NOT YET SERVE</StatusChip></> : <>
            <p className="mini-label">BEST ELIGIBLE OPTION</p><h2>{selected.name}</h2><p className="decision-summary">Arrive in {selected.durationMin} minutes with an estimated exposure index of {selected.exposureIndex}.</p>
            <div className="decision-number"><strong>{selected.durationMin}</strong><span>minutes</span></div>
            <div className="decision-bars"><label><span>Modelled load at arrival</span><strong>{selected.predictedLoad}/{selected.capacity}</strong><i><b style={{ width: `${Math.min(100, selected.predictedLoad / selected.capacity * 100)}%` }} /></i></label><label><span>Canopy-adjacent geometry</span><strong>{selected.canopyAdjacentPct}%</strong><i><b className="green" style={{ width: `${selected.canopyAdjacentPct}%` }} /></i></label></div>
            <ul className="decision-reasons">{selected.reasons.map((reason) => <li key={reason}><Check size={15} />{reason}</li>)}</ul>
            {memoryActive ? <div className="memory-impact"><BrainCircuit size={18} /><span><strong>Memory checked</strong> against one measured local exception.</span></div> : <button className="memory-empty-cta" onClick={onOpenLab}><Sparkles size={17} /> Run the experiment to create the first local rule</button>}
          </>}
          <details className="evidence-details"><summary>How this was calculated</summary><p>Geometry and trees are public evidence. Arrival load, safe capacity and exposure are prototype estimates. Step-free status remains unverified.</p></details>
        </aside>
      </div>
    </section>
  )
}

function LoadBar({ label, values }: { label: string; values: [number, number, number] }) {
  const total = values.reduce((sum, value) => sum + value, 0)
  return <div className="load-bar"><div><span>{label}</span><strong>{total} workers</strong></div><div className="load-bar__track" aria-label={`${label} route distribution`}><i className="route-a" style={{ width: `${values[0] / total * 100}%` }}>A {values[0]}</i><i className="route-b" style={{ width: `${values[1] / total * 100}%` }}>B {values[1]}</i><i className="route-c" style={{ width: `${values[2] / total * 100}%` }}>C {values[2]}</i></div></div>
}

function LabView({ memory, setMemory, weather, onOpenMemory }: { memory: MemoryRule[]; setMemory: (rules: MemoryRule[]) => void; weather: { uvIndex: number }; onOpenMemory: () => void }) {
  const [workers, setWorkers] = useState(300)
  const [uv, setUv] = useState(Math.max(8.2, weather.uvIndex))
  const [phase, setPhase] = useState<LabPhase>(memory.length ? 'stored' : 'ready')
  const [apiStatus, setApiStatus] = useState<'idle' | 'connected' | 'local'>('idle')
  const simulation = simulateScenario(workers, 42)
  const baseline: [number, number, number] = [simulation.routeLoads.A, simulation.routeLoads.B, simulation.routeLoads.C]
  const memoryAware: [number, number, number] = [Math.round(workers * 0.3), Math.round(workers * 0.36), workers - Math.round(workers * 0.3) - Math.round(workers * 0.36)]
  async function runExperiment() {
    setPhase('measured')
    try { const response = await fetch(`/api/decision?need=standard&uv=${uv}&workers=${workers}`); if (!response.ok || !response.headers.get('content-type')?.includes('json')) throw new Error(); await response.json(); setApiStatus('connected') } catch { setApiStatus('local') }
  }
  function storeException() { const rules = saveRule(FIRST_EXCEPTION); setMemory(rules); setPhase('stored') }
  return (
    <section className="workspace lab-workspace">
      <div className="view-heading"><div><p className="view-kicker">PRECINCT LAB</p><h1>Run the same day twice. Change only the decision logic.</h1></div><StatusChip type="model">CONTROLLED SYNTHETIC EXPERIMENT</StatusChip></div>
      <div className="lab-controls">
        <label><span>Workers in scenario <strong>{workers}</strong></span><input type="range" min="100" max="500" step="20" value={workers} onChange={(event) => setWorkers(Number(event.target.value))} /></label>
        <label><span>UV index <strong>{uv.toFixed(1)}</strong></span><input type="range" min="3" max="12" step="0.1" value={uv} onChange={(event) => setUv(Number(event.target.value))} /></label>
        <button className="button button--ink" onClick={runExperiment}><Play size={17} /> Run same conditions</button>
      </div>
      <div className="lab-grid">
        <div className="experiment-stage">
          <div className="experiment-map">
            <svg viewBox="0 0 780 340" role="img" aria-label="Synthetic route allocation experiment">
              <path className="lab-road" d="M80 285 C210 230 275 195 395 168 S590 130 710 60" /><path className="lab-road lab-road--alt" d="M80 285 C205 170 300 110 420 120 S590 108 710 60" /><path className="lab-road lab-road--access" d="M80 285 C210 278 310 255 420 225 S610 155 710 60" />
              <g className="lab-buildings"><rect x="160" y="245" width="80" height="55" /><rect x="300" y="140" width="95" height="65" /><rect x="485" y="65" width="90" height="70" /></g>
              <g className="lab-people">{Array.from({ length: 30 }).map((_, index) => <circle key={index} cx={90 + index * 18} cy={276 - index * 6.2 + (index % 3) * 8} r="4" />)}</g>
              <circle className="lab-sun" cx="675" cy="42" r="22" /><text x="640" y="92">UV {uv.toFixed(1)}</text><text x="82" y="320">CDH / Church St</text><text x="500" y="316">Same demand · same seed · same conditions</text>
            </svg>
            <div className="experiment-stage__status"><span className={phase !== 'ready' ? 'is-done' : 'is-active'}>1 Run</span><ChevronRight /><span className={phase === 'measured' ? 'is-active' : phase === 'stored' || phase === 'replayed' ? 'is-done' : ''}>2 Measure</span><ChevronRight /><span className={phase === 'stored' ? 'is-active' : phase === 'replayed' ? 'is-done' : ''}>3 Remember</span><ChevronRight /><span className={phase === 'replayed' ? 'is-active' : ''}>4 Replay</span></div>
          </div>
          <div className="comparison">
            <article><header><div><span>FIRST PASS</span><h2>Optimise the average</h2></div><StatusChip type="model">BASELINE</StatusChip></header><LoadBar label="Route allocation" values={baseline} /><div className="metric-pair"><div className="positive"><strong>−20%</strong><span>peak crowding</span></div><div className="positive"><strong>−7%</strong><span>walking time</span></div></div><div className={`hidden-cost ${phase === 'ready' ? 'is-covered' : ''}`}><div><Sun /><strong>+40%</strong><span>UV exposure<br />low-UV cohort</span></div><div><Route /><strong>+15%</strong><span>travel friction<br />mobility cohort</span></div>{phase === 'ready' && <button onClick={runExperiment}>Measure who carried the cost</button>}</div></article>
            <article className="comparison__memory"><header><div><span>NEXT PASS</span><h2>Use the learned boundary</h2></div><StatusChip type={memory.length ? 'live' : 'model'}>{memory.length ? 'MEMORY ON' : 'WAITING'}</StatusChip></header><LoadBar label="Capacity-aware allocation" values={memoryAware} /><div className="metric-pair"><div className="positive"><strong>−16%</strong><span>peak crowding</span></div><div className="positive"><strong>−5%</strong><span>walking time</span></div></div><div className="guardrail-result"><Check /><div><strong>Low-UV guardrail passes</strong><span>Route B is removed only where the exception applies.</span></div></div>{!memory.length && phase === 'measured' && <button className="button button--accent button--block" onClick={storeException}><Database size={17} /> Store measured exception</button>}{memory.length && phase !== 'replayed' && <button className="button button--accent button--block" onClick={() => setPhase('replayed')}><RotateCcw size={17} /> Replay identical conditions</button>}{phase === 'replayed' && <div className="replay-payoff"><BrainCircuit /><div><span>EXCEPTION RETRIEVED BEFORE MATCHING</span><strong>Cremorne has seen this before.</strong></div></div>}</article>
          </div>
          <p className="lab-caption">Synthetic MVP output. The comparison holds demand, conditions and random seed constant.</p>
        </div>
        <aside className="backend-trace">
          <div className="backend-trace__head"><div><ServerCog /><span><strong>Decision trace</strong><small>{apiStatus === 'connected' ? 'Serverless API connected' : apiStatus === 'local' ? 'Local engine fallback' : 'Ready to run'}</small></span></div><span className={`api-light ${apiStatus !== 'idle' ? 'is-on' : ''}`} /></div>
          <div className="trace-flow"><div className={phase !== 'ready' ? 'is-active' : ''}><Activity /><span><strong>OBSERVE</strong><small>{workers} workers · UV {uv.toFixed(1)}</small></span></div><i /><div className={phase !== 'ready' ? 'is-active' : ''}><CircleGauge /><span><strong>PREDICT</strong><small>load at time of use</small></span></div><i /><div className={phase !== 'ready' ? 'is-active' : ''}><Layers3 /><span><strong>MATCH</strong><small>capacity + constraints</small></span></div><i /><div className={phase !== 'ready' ? 'is-active' : ''}><Activity /><span><strong>MEASURE</strong><small>aggregate + cohort effect</small></span></div><i /><div className={memory.length ? 'is-active' : ''}><BrainCircuit /><span><strong>REMEMBER</strong><small>exception + boundary</small></span></div></div>
          <div className="payload-card"><p>MEMORY WRITE</p><code>{`context: high UV + congestion\nintervention: Route B\noutcome: crowding −20%\nexception: low-UV exposure +40%\nboundary: UV ≥ 7\nconfidence: 0.82`}</code></div>
          <div className="backend-actions"><button onClick={onOpenMemory} disabled={!memory.length}>Inspect stored rule <ArrowRight size={15} /></button><a href="/api/decision?need=low-uv&memory=1" target="_blank" rel="noreferrer">Open API JSON <ExternalLink size={14} /></a></div>
        </aside>
      </div>
    </section>
  )
}

function SpacesView() {
  const [people, setPeople] = useState(6), [hybrid, setHybrid] = useState(true), [accessible, setAccessible] = useState(true)
  const results = useMemo(() => findSpaces({ people, requireHybrid: hybrid, requireAccessible: accessible }), [people, hybrid, accessible])
  return <section className="workspace spaces-workspace">
    <div className="view-heading"><div><p className="view-kicker">SAME MEMORY · DIFFERENT CAPACITY</p><h1>Find a room that is usable—not merely empty.</h1></div><StatusChip type="public">CDH VENUE CAPACITY</StatusChip></div>
    <div className="space-query"><div className="space-query__sentence">I need a room for <input aria-label="People" type="number" min="2" max="80" value={people} onChange={(event) => setPeople(Number(event.target.value))} /> people</div><label><input type="checkbox" checked={hybrid} onChange={(event) => setHybrid(event.target.checked)} /> Hybrid meeting</label><label><input type="checkbox" checked={accessible} onChange={(event) => setAccessible(event.target.checked)} /> Accessible venue</label></div>
    <div className="space-grid">{results.map((space) => <article key={space.id} className={`space-card ${space.eligible ? 'is-eligible' : ''}`}><div className="space-card__visual"><Building2 /><span>{space.mode}</span><b>{space.capacity}</b><small>seated capacity</small></div><div className="space-card__body"><span className="space-status">{space.eligible ? 'ELIGIBLE' : 'OUTSIDE ELIGIBLE SET'}</span><h2>{space.name}</h2><div className="facility-list">{space.facilities.map((facility) => <span key={facility}>{facility}</span>)}</div>{space.eligible ? <><p>Owner-provided demo window</p><strong>{space.availability[0]}</strong></> : <ul>{space.blockers.map((blocker) => <li key={blocker}><X size={14} /> {blocker}</li>)}</ul>}</div></article>)}</div>
    <div className="space-principle"><Layers3 /><div><strong>Capacity discovery without calendar exposure.</strong><span>The prototype shares venue capability, access class and a bounded availability window. Meeting titles, attendees and internal calendars stay outside the graph.</span></div></div>
  </section>
}

function MemoryView({ memory, onClear, onOpenLab }: { memory: MemoryRule[]; onClear: () => void; onOpenLab: () => void }) {
  return <section className="workspace memory-workspace">
    <div className="view-heading"><div><p className="view-kicker">LOCAL OPERATING MEMORY</p><h1>What Cremorne learned—and where it applies.</h1></div>{memory.length > 0 && <button className="mini-button" onClick={onClear}><RotateCcw size={15} /> Reset demo memory</button>}</div>
    {memory.length === 0 ? <div className="empty-memory"><div className="empty-memory__orb"><BrainCircuit /></div><h2>No measured rule has been stored yet.</h2><p>Run the controlled route experiment, reveal the cohort-level failure, then write its deployment boundary.</p><button className="button button--accent" onClick={onOpenLab}>Go to Precinct Lab <ArrowRight size={17} /></button></div> : memory.map((rule) => <div className="memory-record" key={rule.id}><div className="memory-record__hero"><span>ACTIVE OPERATING RULE</span><h2>Route B can reduce congestion—except when high UV conflicts with a low-UV requirement.</h2><p>Measured local evidence now changes eligibility before preference ranking.</p></div><div className="memory-graph" aria-label="Memory evidence graph"><div><small>CONTEXT</small><strong>Church St · UV ≥ {rule.context.uvMin}</strong><span>crowding ≥ {rule.context.crowdingMin}</span></div><ChevronRight /><div><small>INTERVENTION</small><strong>Redistribute via Route B</strong><span>generic first pass</span></div><ChevronRight /><div><small>OUTCOME</small><strong>−20% crowding</strong><span>−7% walking time</span></div><ChevronRight /><div className="memory-graph__exception"><small>EXCEPTION</small><strong>+40% UV exposure</strong><span>low-UV cohort</span></div><ChevronRight /><div className="memory-graph__rule"><small>BOUNDARY</small><strong>Filter for low-UV need</strong><span>when UV ≥ 7</span></div></div><div className="memory-record__foot"><span><Database /> Persistent in this browser</span><span><CircleGauge /> Confidence {(rule.confidence * 100).toFixed(0)}%</span><span><BookOpenCheck /> Reused only in comparable context</span></div></div>)}
    <div className="privacy-strip"><strong>Share constraints, not diagnoses.</strong><span>Share capacity, not calendars.</span><span>Store outcomes, not identities.</span></div>
    <section className="data-sources"><h2>Evidence behind this prototype</h2><div>{productContext.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer"><Database /><span><strong>{source.label}</strong><small>{source.licence}</small></span><ExternalLink /></a>)}</div></section>
  </section>
}

export default function App() { return window.location.pathname.startsWith(PATHS.product) ? <ProductApp /> : <Landing /> }
