import { useEffect, useMemo, useState } from 'react'
import {
  Activity, ArrowRight, BrainCircuit, Building2, Check, ChevronRight,
  CircleGauge, ExternalLink, FlaskConical, Layers3, Map as MapIcon, Play,
  RotateCcw, Route, ServerCog, ShieldAlert, Sun, ThermometerSun, Trees, Users, X,
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
type LabPhase = 'ready' | 'running' | 'measured' | 'stored' | 'replayed'

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
  const [step, setStep] = useState(0)
  const loop = [
    { label: 'Predict', value: '92%', unit: 'Route B load', note: 'pinch point in 15 min' },
    { label: 'Measure', value: '−20%', unit: 'crowding', note: '−7% walking time' },
    { label: 'Find the edge', value: '+40%', unit: 'UV · low-UV cohort', note: '+15% mobility friction' },
    { label: 'Remember', value: 'Route C', unit: 'next eligible match', note: 'exception applied before ranking' },
  ]
  useEffect(() => {
    const timer = window.setInterval(() => setStep((value) => (value + 1) % loop.length), 2600)
    return () => window.clearInterval(timer)
  }, [loop.length])

  return (
    <main className="landing">
      <header className="landing-nav wrap">
        <Brand />
        <div className="landing-nav__links">
          <a href="#mechanism">The mechanism</a>
          <button className="button button--ink" onClick={() => go(PATHS.product)}>Try the product <ArrowRight size={17} /></button>
        </div>
      </header>

      <section className="hero wrap">
        <div className="hero__copy">
          <p className="eyebrow"><span className="live-dot" /> Built for one square kilometre of Cremorne</p>
          <h1>The capacity is already here. <em>Cremorne just cannot see it together.</em></h1>
          <p className="hero__lead">Predict the pinch. Use what is already there. Remember what happened.</p>
          <div className="hero__actions">
            <button className="button button--accent button--large" onClick={() => go(PATHS.product)}>Try Cremorne Memory <ArrowRight size={19} /></button>
            <a className="text-link" href="#mechanism">Watch it learn <ChevronRight size={16} /></a>
          </div>
          <div className="hero__facts" aria-label="Cremorne facts">
            <div><strong>700+</strong><span>businesses</span></div>
            <div><strong>10,000+</strong><span>workers</span></div>
            <div><strong>&lt;1 km²</strong><span>one shared precinct</span></div>
          </div>
        </div>

        <div className="hero__visual" aria-label="Illustrated Cremorne capacity problem">
          <img src="/illustrations/cremorne-hero-unified.png" alt="Hand-drawn Cremorne scene showing a crowded exposed street, a covered route and spare indoor capacity" />
          <div className="hero-note hero-note--crowd">Overloaded now</div>
          <div className="hero-note hero-note--route">Underused space</div>
          <div className="hero-note hero-note--room">Shaded capacity</div>
          <div className="hero-graph"><span>PLACE</span><ArrowRight size={15} /><strong>CAPACITY × TIME × RULES</strong></div>
        </div>
      </section>

      <section className="mechanism-demo" id="mechanism">
        <div className="wrap mechanism-demo__intro"><p className="eyebrow">THE PART USERS DO NOT HAVE TO THINK ABOUT</p><h2>Every decision leaves the next one smarter.</h2></div>
        <div className={`memory-machine wrap memory-machine--${step}`}>
          <div className="loop-switcher" role="tablist" aria-label="Learning loop stage">
            {loop.map((item, index) => <button key={item.label} className={step === index ? 'is-active' : ''} onClick={() => setStep(index)}><span>{index + 1}</span>{item.label}</button>)}
          </div>
          <div className="machine-map">
            <svg viewBox="0 0 860 460" role="img" aria-label="Animated capacity and Memory mechanism">
              <path className="machine-grid" d="M30 95H830M30 225H830M30 355H830M170 25V435M395 25V435M635 25V435" />
              <g className="machine-buildings"><rect x="190" y="118" width="155" height="80"/><rect x="430" y="250" width="165" height="82"/><rect x="655" y="105" width="130" height="95"/></g>
              <path className="machine-route route-one" d="M75 390 C185 328 244 274 365 236 S602 190 787 62" />
              <path className="machine-route route-two" d="M75 390 C178 215 302 115 470 128 S655 105 787 62" />
              <path className="machine-route route-three" d="M75 390 C210 379 345 350 480 295 S662 156 787 62" />
              <g className="machine-demand">{Array.from({length: 18}).map((_, index) => <circle key={index} cx={90 + index * 35} cy={378 - index * 16 + (index % 3) * 9} r="6" />)}</g>
              <g className="machine-capacity"><circle cx="315" cy="157" r="30"/><circle cx="515" cy="290" r="30"/><circle cx="720" cy="155" r="30"/></g>
              <circle className="machine-origin" cx="75" cy="390" r="13"/><circle className="machine-destination" cx="787" cy="62" r="13"/>
            </svg>
            <div className="graph-key"><span>movement</span><span>workspace</span><span>time window</span></div>
          </div>
          <div className="machine-readout" aria-live="polite">
            <span>{loop[step].label}</span><strong>{loop[step].value}</strong><b>{loop[step].unit}</b><small>{loop[step].note}</small>
            <div className="readout-meter"><i style={{width: `${[92, 64, 100, 72][step]}%`}} /></div>
          </div>
          <div className="machine-core"><BrainCircuit /><span>CONTEXT</span><i>+</i><span>OUTCOME</span><i>+</i><span>EXCEPTION</span></div>
        </div>
        <div className="mechanism-proof wrap"><span><Layers3 /> Capacity Graph</span><span><CircleGauge /> Controlled comparison</span><span><BrainCircuit /> Exception Memory</span><button onClick={() => go(PATHS.product)}>Open the working loop <ArrowRight size={16}/></button></div>
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
    <div className="app-shell app-shell--tool">
      <aside className="app-rail">
        <a className="rail-brand" href={PATHS.landing} aria-label="Cremorne Memory home"><span /><span /><span /></a>
        <nav aria-label="Product tools">{nav.map(({ id, label, icon: Icon }) => <button key={id} title={label} aria-label={label} className={view === id ? 'is-active' : ''} onClick={() => setView(id)}><Icon size={21} /><span>{label}</span></button>)}</nav>
        <button className={`rail-memory ${memory.length ? 'is-active' : ''}`} title={`${memory.length} stored rule`} onClick={() => setView('memory')}><BrainCircuit size={20} /><i>{memory.length}</i></button>
        <a className="rail-home" href={PATHS.landing} title="Product story"><ExternalLink size={18} /></a>
      </aside>
      <main className="app-main app-main--canvas">
        {view === 'worker' && <WorkerView weather={weather} memoryActive={memory.length > 0} onOpenLab={() => setView('lab')} />}
        {view === 'lab' && <LabView memory={memory} setMemory={setMemory} weather={weather} onOpenMemory={() => setView('memory')} />}
        {view === 'spaces' && <SpacesView />}
        {view === 'memory' && <MemoryView memory={memory} onClear={() => { clearMemory(); setMemory([]) }} onOpenLab={() => setView('lab')} />}
      </main>
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
  return (
    <section className="worker-canvas">
      <div className="map-stage map-stage--fullscreen">
        <CremorneMap routes={routes} selectedId={selected?.id} onSelect={setSelectedId} showTrees={showTrees} />
        <div className="map-live-pills">
          <span><ThermometerSun size={15} />{weather.temperature.toFixed(0)}°</span>
          <span><Sun size={15} />UV {weather.uvIndex.toFixed(1)}</span>
          <span><Users size={15} />{station.pmPeakEntries?.toLocaleString()} PM peak</span>
        </div>
        <div className="map-layer-control"><button className={showTrees ? 'is-on' : ''} onClick={() => setShowTrees((value) => !value)}><Trees size={17} /></button><small>Vicmap trees</small></div>
        <div className="map-source">OSM routes · Vicmap trees · DTP patronage</div>
      </div>

      <aside className="journey-sheet">
        <div className="journey-sheet__head"><span>Journey</span><button onClick={onOpenLab}><FlaskConical size={16} /> Test</button></div>
        <div className="journey-pair"><strong>CDH</strong><ArrowRight size={16} /><select aria-label="Destination" value={destination} onChange={(event) => setDestination(event.target.value as DestinationId)}><option value="east-richmond">East Richmond</option><option value="richmond">Richmond</option></select><input aria-label="Departure time" type="time" value={departure} onChange={(event) => setDeparture(event.target.value)} /></div>
        <div className="need-selector" role="group" aria-label="Route need">
          <button className={need === 'lower-uv' ? 'is-selected' : ''} onClick={() => setNeed('lower-uv')}><Sun size={18} /><span>Low UV</span></button>
          <button className={need === 'fastest' ? 'is-selected' : ''} onClick={() => setNeed('fastest')}><Route size={18} /><span>Fast</span></button>
          <button className={need === 'step-free' ? 'is-selected' : ''} onClick={() => setNeed('step-free')}><ShieldAlert size={18} /><span>Step-free</span></button>
        </div>
        {noEligible ? <div className="coverage-gap compact" role="alert"><ShieldAlert /><div><strong>Route evidence incomplete</strong><span>Step-free recommendation paused</span></div></div> : <div className="route-list route-list--compact" aria-live="polite">{routes.map((route) => (
          <button key={route.id} className={`route-option ${selected.id === route.id ? 'is-selected' : ''} ${!route.eligible ? 'is-blocked' : ''}`} onClick={() => setSelectedId(route.id)}>
            <i className="route-swatch" /><div><strong>{route.name}</strong><span>{route.canopyAdjacentPct}% shade · {Math.max(0, route.remainingCapacity)} open</span></div><b>{route.eligible ? `${route.durationMin}m` : <X size={15} />}</b>
          </button>
        ))}</div>}
      </aside>

      <aside className={`route-sheet ${noEligible ? 'route-sheet--gap' : ''}`}>
        {noEligible ? <><ShieldAlert /><strong>Cannot verify this journey yet.</strong><span>Kerb, gradient and crossing data required.</span></> : <>
          <div className="route-sheet__top"><span>{selected.recommended ? 'BEST FIT' : 'ROUTE'}</span>{memoryActive && <BrainCircuit size={18} />}</div>
          <h2>{selected.name}</h2>
          <div className="route-sheet__metrics"><div><strong>{selected.durationMin}</strong><span>min</span></div><div><strong>{selected.exposureIndex}</strong><span>UV load</span></div><div><strong>{Math.max(0, selected.remainingCapacity)}</strong><span>open</span></div></div>
          <div className="capacity-meter"><i style={{ width: `${Math.min(100, selected.predictedLoad / selected.capacity * 100)}%` }} /></div>
          <button className="start-route">Use this route <ArrowRight size={17} /></button>
          <details><summary>Evidence</summary><ul>{selected.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><small>Public geometry + modelled arrival state</small></details>
        </>}
      </aside>
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
  useEffect(() => {
    if (phase === 'ready' || phase === 'replayed') return
    const next: LabPhase = phase === 'running' ? 'measured' : phase === 'measured' ? 'stored' : 'replayed'
    const timer = window.setTimeout(() => {
      if (next === 'stored') setMemory(saveRule(FIRST_EXCEPTION))
      setPhase(next)
    }, phase === 'running' ? 900 : phase === 'measured' ? 1200 : 1300)
    return () => window.clearTimeout(timer)
  }, [phase, setMemory])
  async function runExperiment() {
    setPhase('running')
    try { const response = await fetch(`/api/decision?need=standard&uv=${uv}&workers=${workers}`); if (!response.ok || !response.headers.get('content-type')?.includes('json')) throw new Error(); await response.json(); setApiStatus('connected') } catch { setApiStatus('local') }
  }
  return (
    <section className={`lab-console phase-${phase}`}>
      <header className="console-toolbar">
        <div className="console-title"><FlaskConical /><span><strong>Precinct Lab</strong><small>Church Street · controlled run</small></span></div>
        <label><span>Workers</span><input type="range" min="100" max="500" step="20" value={workers} onChange={(event) => setWorkers(Number(event.target.value))} /><strong>{workers}</strong></label>
        <label><span>UV</span><input type="range" min="3" max="12" step="0.1" value={uv} onChange={(event) => setUv(Number(event.target.value))} /><strong>{uv.toFixed(1)}</strong></label>
        <button className="run-loop" onClick={runExperiment}>{phase === 'running' || phase === 'measured' || phase === 'stored' ? <Activity size={17} /> : <Play size={17} />} {phase === 'replayed' ? 'Run again' : phase === 'ready' ? 'Run full loop' : 'Running…'}</button>
      </header>
      <div className="lab-grid">
        <div className="experiment-stage">
          <div className="experiment-map">
            <svg viewBox="0 0 780 340" role="img" aria-label="Synthetic route allocation experiment">
              <path className="lab-road" d="M80 285 C210 230 275 195 395 168 S590 130 710 60" /><path className="lab-road lab-road--alt" d="M80 285 C205 170 300 110 420 120 S590 108 710 60" /><path className="lab-road lab-road--access" d="M80 285 C210 278 310 255 420 225 S610 155 710 60" />
              <g className="lab-buildings"><rect x="160" y="245" width="80" height="55" /><rect x="300" y="140" width="95" height="65" /><rect x="485" y="65" width="90" height="70" /></g>
              <g className="lab-people">{Array.from({ length: 30 }).map((_, index) => <circle style={{ animationDelay: `${index * -0.08}s` }} key={index} cx={90 + index * 18} cy={276 - index * 6.2 + (index % 3) * 8} r="4" />)}</g>
              <circle className="lab-sun" cx="675" cy="42" r="22" /><text x="640" y="92">UV {uv.toFixed(1)}</text><text x="82" y="320">CDH / Church St</text><text x="500" y="316">Same demand · same seed · same conditions</text>
            </svg>
            <div className="experiment-stage__status"><span className={phase === 'running' ? 'is-active' : phase !== 'ready' ? 'is-done' : ''}>Run</span><ChevronRight /><span className={phase === 'measured' ? 'is-active' : phase === 'stored' || phase === 'replayed' ? 'is-done' : ''}>Measure</span><ChevronRight /><span className={phase === 'stored' ? 'is-active' : phase === 'replayed' ? 'is-done' : ''}>Remember</span><ChevronRight /><span className={phase === 'replayed' ? 'is-active' : ''}>Replay</span></div>
          </div>
          <div className="comparison">
            <article><header><div><span>FIRST PASS</span><h2>Average</h2></div><StatusChip type="model">BASELINE</StatusChip></header><LoadBar label="Route load" values={baseline} /><div className="metric-pair"><div className="positive"><strong>−20%</strong><span>crowding</span></div><div className="positive"><strong>−7%</strong><span>time</span></div></div><div className={`hidden-cost ${phase === 'ready' || phase === 'running' ? 'is-covered' : ''}`}><div><Sun /><strong>+40%</strong><span>UV · low-UV</span></div><div><Route /><strong>+15%</strong><span>mobility friction</span></div>{(phase === 'ready' || phase === 'running') && <button onClick={runExperiment}>{phase === 'running' ? 'Measuring…' : 'Reveal distribution'}</button>}</div></article>
            <article className="comparison__memory"><header><div><span>NEXT PASS</span><h2>Memory-aware</h2></div><StatusChip type={memory.length ? 'live' : 'model'}>{memory.length ? 'ACTIVE' : 'WAITING'}</StatusChip></header><LoadBar label="Route load" values={memoryAware} /><div className="metric-pair"><div className="positive"><strong>−16%</strong><span>crowding</span></div><div className="positive"><strong>−5%</strong><span>time</span></div></div><div className="guardrail-result"><Check /><div><strong>Guardrail passes</strong><span>low-UV + mobility</span></div></div>{phase === 'replayed' && <div className="replay-payoff"><BrainCircuit /><div><span>EXCEPTION RETRIEVED</span><strong>Next decision changed.</strong></div></div>}</article>
          </div>
          <p className="lab-caption">Synthetic MVP output. The comparison holds demand, conditions and random seed constant.</p>
        </div>
        <aside className="backend-trace">
          <div className="backend-trace__head"><div><ServerCog /><span><strong>Decision trace</strong><small>{apiStatus === 'connected' ? 'Serverless API connected' : apiStatus === 'local' ? 'Local engine fallback' : 'Ready to run'}</small></span></div><span className={`api-light ${apiStatus !== 'idle' ? 'is-on' : ''}`} /></div>
          <div className="trace-flow"><div className={phase !== 'ready' ? 'is-active' : ''}><Activity /><span><strong>OBSERVE</strong><small>{workers} workers · UV {uv.toFixed(1)}</small></span></div><i /><div className={phase !== 'ready' ? 'is-active' : ''}><CircleGauge /><span><strong>PREDICT</strong><small>load at time of use</small></span></div><i /><div className={phase !== 'ready' ? 'is-active' : ''}><Layers3 /><span><strong>MATCH</strong><small>capacity + constraints</small></span></div><i /><div className={phase !== 'ready' ? 'is-active' : ''}><Activity /><span><strong>MEASURE</strong><small>aggregate + cohort effect</small></span></div><i /><div className={memory.length ? 'is-active' : ''}><BrainCircuit /><span><strong>REMEMBER</strong><small>exception + boundary</small></span></div></div>
          <details className="payload-card"><summary>Inspect Memory write</summary><code>{`context: high UV + congestion\nintervention: Route B\noutcome: crowding −20%\nexception: low-UV exposure +40%\nboundary: UV ≥ 7\nconfidence: 0.82`}</code></details>
          <div className="backend-actions"><button onClick={onOpenMemory} disabled={!memory.length}>Inspect stored rule <ArrowRight size={15} /></button><a href="/api/decision?need=low-uv&memory=1" target="_blank" rel="noreferrer">Open API JSON <ExternalLink size={14} /></a></div>
        </aside>
      </div>
    </section>
  )
}

function SpacesView() {
  const [people, setPeople] = useState(6), [hybrid, setHybrid] = useState(true), [accessible, setAccessible] = useState(true)
  const [selectedId, setSelectedId] = useState('boardroom')
  const [held, setHeld] = useState(false)
  const results = useMemo(() => findSpaces({ people, requireHybrid: hybrid, requireAccessible: accessible }), [people, hybrid, accessible])
  const selected = results.find((space) => space.id === selectedId) ?? results[0]
  const chooseSpace = (id: string) => { setSelectedId(id); setHeld(false) }
  return <section className="spaces-tool">
    <header className="console-toolbar space-toolbar">
      <div className="console-title"><Building2 /><span><strong>Space finder</strong><small>CDH participating capacity</small></span></div>
      <label><span>People</span><input aria-label="People" type="range" min="2" max="80" value={people} onChange={(event) => { setPeople(Number(event.target.value)); setHeld(false) }}/><strong>{people}</strong></label>
      <button className={hybrid ? 'filter-toggle is-on' : 'filter-toggle'} onClick={() => { setHybrid((value) => !value); setHeld(false) }}>Hybrid</button>
      <button className={accessible ? 'filter-toggle is-on' : 'filter-toggle'} onClick={() => { setAccessible((value) => !value); setHeld(false) }}>Accessible</button>
    </header>
    <div className="spaces-tool__layout">
      <aside className="space-results"><div className="space-results__head"><strong>{results.filter((space) => space.eligible).length} match</strong><span>14:00–15:00</span></div>{results.map((space) => <button key={space.id} onClick={() => chooseSpace(space.id)} className={`${selected.id === space.id ? 'is-selected' : ''} ${space.eligible ? 'is-eligible' : 'is-blocked'}`}><i/><div><strong>{space.name.replace('CDH ', '')}</strong><span>{space.capacity} seats · {space.mode}</span></div>{space.eligible ? <Check size={16}/> : <X size={16}/>}</button>)}</aside>
      <main className="space-plan" aria-label="Interactive CDH space plan">
        <div className="plan-corridor"><span>LEVEL 1</span></div>
        {results.map((space, index) => <button key={space.id} onClick={() => chooseSpace(space.id)} className={`plan-room plan-room--${index + 1} ${selected.id === space.id ? 'is-selected' : ''} ${space.eligible ? 'is-eligible' : 'is-blocked'}`}><Building2/><strong>{space.name.replace('CDH ', '')}</strong><span>{space.capacity}</span></button>)}
        <div className="space-timeline"><span>13:00</span><i/><span>14:00</span><b/><span>15:00</span><i/><span>16:00</span></div>
      </main>
      <aside className="space-inspector"><span className="mini-label">{selected.eligible ? 'ELIGIBLE SPACE' : 'FILTERED'}</span><h2>{selected.name}</h2><div className="space-inspector__number"><strong>{selected.capacity}</strong><span>seats</span></div><div className="facility-list">{selected.facilities.map((facility) => <span key={facility}>{facility}</span>)}</div>{selected.eligible ? <><div className="available-window"><span>OPEN WINDOW</span><strong>{selected.availability[0]}</strong></div><button className={held ? 'start-route is-held' : 'start-route'} onClick={() => setHeld(true)}>{held ? <><Check size={17}/> Demo slot held</> : <>Hold this slot <ArrowRight size={17}/></>}</button></> : <ul className="space-blockers">{selected.blockers.map((blocker) => <li key={blocker}><X size={14}/>{blocker}</li>)}</ul>}<details><summary>Shared data</summary><small>Capacity, capability and bounded availability only.</small></details></aside>
    </div>
  </section>
}

function MemoryView({ memory, onClear, onOpenLab }: { memory: MemoryRule[]; onClear: () => void; onOpenLab: () => void }) {
  const rule = memory[0]
  return <section className="memory-tool">
    <header className="console-toolbar memory-toolbar"><div className="console-title"><BrainCircuit/><span><strong>Operational Memory</strong><small>{memory.length} active rule{memory.length === 1 ? '' : 's'}</small></span></div><div className="memory-toolbar__chips"><span>context</span><span>outcome</span><span>exception</span><span>boundary</span></div>{memory.length > 0 && <button className="filter-toggle" onClick={onClear}><RotateCcw size={15}/>Reset</button>}</header>
    {memory.length === 0 ? <div className="empty-memory"><div className="empty-memory__orb"><BrainCircuit /></div><h2>Memory is empty</h2><button className="button button--accent" onClick={onOpenLab}>Run the first loop <ArrowRight size={17} /></button></div> : <div className="memory-tool__layout">
      <main className="memory-canvas" aria-label="Context and exception knowledge graph">
        <svg viewBox="0 0 900 540" aria-hidden="true"><path d="M130 270 C230 150 295 150 390 240"/><path d="M130 270 C235 375 300 390 405 310"/><path d="M405 275 C520 275 560 180 665 155"/><path d="M405 275 C530 285 565 390 680 385"/><path d="M685 155 C765 215 765 315 690 385"/></svg>
        <div className="memory-node node-context"><small>CONTEXT</small><strong>UV ≥ {rule.context.uvMin}</strong><span>Church St</span></div>
        <div className="memory-node node-intervention"><small>ACTION</small><strong>Route B</strong><span>redistribute</span></div>
        <div className="memory-node node-outcome"><small>OUTCOME</small><strong>−20%</strong><span>crowding</span></div>
        <div className="memory-node node-exception"><small>EXCEPTION</small><strong>+40%</strong><span>low-UV exposure</span></div>
        <div className="memory-node node-boundary"><small>BOUNDARY</small><strong>UV ≥ 7</strong><span>filter for low UV</span></div>
        <div className="memory-core-node"><BrainCircuit/><span>CREMORNE<br/>MEMORY</span></div>
      </main>
      <aside className="memory-inspector"><span className="mini-label">ACTIVE RULE</span><h2>High UV × low-UV need</h2><div className="confidence-ring" style={{'--confidence': `${rule.confidence * 100}%`} as React.CSSProperties}><strong>{(rule.confidence * 100).toFixed(0)}%</strong><span>confidence</span></div><div className="rule-effect"><X/><span>Route B</span><ArrowRight/><Check/><strong>Route C</strong></div><button className="start-route" onClick={onOpenLab}>Replay evidence <RotateCcw size={16}/></button><details><summary>Evidence sources</summary>{productContext.sources.map((source)=><a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label}<ExternalLink size={12}/></a>)}</details></aside>
    </div>}
    <div className="privacy-dock"><span>constraints ≠ diagnoses</span><span>capacity ≠ calendars</span><span>outcomes ≠ identities</span></div>
  </section>
}

export default function App() { return window.location.pathname.startsWith(PATHS.product) ? <ProductApp /> : <Landing /> }
