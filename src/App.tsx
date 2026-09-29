import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowRight,
  Building2,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  CloudSun,
  Code2,
  Database,
  Eye,
  Footprints,
  Gauge,
  History,
  KeyRound,
  Layers3,
  MapPin,
  MemoryStick,
  MousePointer2,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Sun,
  Users,
  Workflow,
  X,
} from 'lucide-react'
import type {
  DemoPhase,
  FunctionalNeed,
  MemoryRule,
  RouteEvaluation,
  RouteId,
  Scenario,
} from './domain'
import {
  chooseRoute,
  distributeWithMemory,
  evaluateRoutes,
  FIRST_EXCEPTION,
  ROUTES,
  simulateScenario,
} from './engine'
import { clearMemory, loadMemory, saveRule } from './memory'

const phases: { id: DemoPhase; short: string; label: string }[] = [
  { id: 'observe', short: '01', label: 'Observe' },
  { id: 'first-pass', short: '02', label: 'Predict + match' },
  { id: 'measured', short: '03', label: 'Measure' },
  { id: 'remembered', short: '04', label: 'Learn' },
  { id: 'replay', short: '05', label: 'Next pass' },
]

const phaseIndex = (phase: DemoPhase) => phases.findIndex((item) => item.id === phase)

const defaultScenario: Scenario = {
  uvIndex: 8.2,
  temperature: 31,
  crowding: 82,
  workers: 300,
  departure: '2:20 pm',
  weatherSource: 'scenario',
}

const needLabels: Record<FunctionalNeed, string> = {
  standard: 'Fast + less crowded',
  'low-uv': 'Low UV required',
  'step-free': 'Step-free required',
}

function App() {
  const [phase, setPhase] = useState<DemoPhase>('observe')
  const [need, setNeed] = useState<FunctionalNeed>('standard')
  const [scenario, setScenario] = useState<Scenario>(defaultScenario)
  const [rules, setRules] = useState<MemoryRule[]>(() => loadMemory())
  const [selectedRoute, setSelectedRoute] = useState<RouteId>('B')
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const labRef = useRef<HTMLElement>(null)
  const result = useMemo(() => simulateScenario(scenario.workers, 42), [scenario.workers])
  const activeRules = phase === 'replay' ? rules : []
  const evaluatedRoutes = useMemo(
    () => evaluateRoutes(scenario, need, activeRules),
    [scenario, need, activeRules],
  )
  const selected = evaluatedRoutes.find((route) => route.id === selectedRoute) ?? evaluatedRoutes[0]
  const learnedDistribution = useMemo(
    () => distributeWithMemory(scenario.workers),
    [scenario.workers],
  )

  useEffect(() => {
    const controller = new AbortController()
    const url =
      'https://api.open-meteo.com/v1/forecast?latitude=-37.829&longitude=144.992&current=temperature_2m&hourly=uv_index&forecast_days=1&timezone=Australia%2FSydney'

    fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Weather unavailable')
        return response.json()
      })
      .then((data: { current?: { temperature_2m?: number; time?: string }; hourly?: { time?: string[]; uv_index?: number[] } }) => {
        const currentTime = data.current?.time
        const timeIndex = currentTime ? data.hourly?.time?.findIndex((time) => time === currentTime) : -1
        const uv = timeIndex !== undefined && timeIndex >= 0 ? data.hourly?.uv_index?.[timeIndex] : undefined
        const temp = data.current?.temperature_2m

        if (typeof temp === 'number') {
          setScenario((current) => ({
            ...current,
            temperature: Math.round(temp),
            uvIndex: typeof uv === 'number' && uv >= 6.5 ? Number(uv.toFixed(1)) : current.uvIndex,
            weatherSource: 'live',
          }))
        }
      })
      .catch(() => undefined)

    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (phase === 'replay') {
      const best = chooseRoute(scenario, need, rules)
      setSelectedRoute(best.id)
    }
  }, [phase, need, rules, scenario])

  const startDemo = () => {
    setPhase('observe')
    setNeed('standard')
    setSelectedRoute('B')
    labRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const nextAction = () => {
    if (phase === 'observe') {
      setPhase('first-pass')
      setSelectedRoute('B')
      return
    }
    if (phase === 'first-pass') {
      setPhase('measured')
      return
    }
    if (phase === 'measured') {
      const next = saveRule(FIRST_EXCEPTION)
      setRules(next)
      setPhase('remembered')
      setMemoryOpen(true)
      return
    }
    if (phase === 'remembered') {
      setMemoryOpen(false)
      setNeed('low-uv')
      setPhase('replay')
      return
    }
    setWorkspaceOpen(true)
  }

  const resetStory = () => {
    clearMemory()
    setRules([])
    setNeed('standard')
    setSelectedRoute('B')
    setPhase('observe')
    setWorkspaceOpen(false)
    setMemoryOpen(false)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Cremorne Memory home">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span>Cremorne Memory</span>
        </a>
        <nav className="topnav" aria-label="Primary navigation">
          <a href="#decision-lab">Decision lab</a>
          <a href="#architecture">How it works</a>
          <button className="nav-memory" onClick={() => setMemoryOpen(true)}>
            <MemoryStick size={15} /> Memory <span>{rules.length}</span>
          </button>
          <a className="github-link" href="https://github.com/arkkn0/Team-Bubble" target="_blank" rel="noreferrer">
            <Code2 size={16} /> Code
          </a>
        </nav>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><CircleDot size={14} /> One square kilometre. One shared learning layer.</div>
            <h1>The capacity is already here.<br /><em>Cremorne just can’t see it together.</em></h1>
            <p className="hero-lede">
              Predict a mismatch. Find capacity that is genuinely usable. Measure what happened—and make the next decision better.
            </p>
            <div className="hero-actions">
              <button className="primary-button" onClick={startDemo}>
                Run the 90-second proof <ArrowDown size={18} />
              </button>
              <button className="text-button" onClick={() => setWorkspaceOpen(true)}>
                See workspace capacity <ArrowRight size={17} />
              </button>
            </div>
            <div className="hero-stats" aria-label="Cremorne context">
              <div><strong>700+</strong><span>businesses</span></div>
              <div><strong>10,000+</strong><span>workers</span></div>
              <div><strong>&lt;1 km²</strong><span>shared precinct</span></div>
            </div>
          </div>

          <div className="hero-visual" aria-label="Cremorne capacity illustration">
            <div className="hero-image-wrap">
              <img src="/illustrations/cremorne-capacity-reframe.png" alt="Hand-drawn Cremorne streets, covered passage and workspace" />
              <div className="scribble-label label-overloaded">Overloaded</div>
              <div className="scribble-label label-spare">Spare movement</div>
              <div className="scribble-label label-underused">Underused</div>
            </div>
            <div className="reframe-card">
              <span>STREETS · PASSAGES · ROOMS · TIME</span>
              <ArrowRight size={24} />
              <strong>USABLE CAPACITY</strong>
            </div>
          </div>
        </section>

        <section className="reframe-strip" aria-label="Product definition">
          <span className="empty-rule">Empty</span>
          <span>≠</span>
          <span className="available-rule">available</span>
          <span>≠</span>
          <span className="usable-rule">usable</span>
          <p>A route or room enters the eligible set only when its access, time, capacity and functional constraints are satisfied.</p>
        </section>

        <section className="decision-lab" id="decision-lab" ref={labRef}>
          <div className="section-heading">
            <div>
              <span className="section-kicker">WORKING PROTOTYPE · SYNTHETIC CREMORNE SCENARIO</span>
              <h2>One afternoon. Two passes.<br />A different second decision.</h2>
            </div>
            <button className="reset-button" onClick={resetStory}><RefreshCcw size={15} /> Reset story</button>
          </div>

          <LearningRail phase={phase} />

          <div className="lab-grid">
            <div className="map-stage">
              <ScenarioBar scenario={scenario} phase={phase} />
              <PrecinctMap
                routes={evaluatedRoutes}
                selectedRoute={selectedRoute}
                phase={phase}
                onSelect={setSelectedRoute}
              />
              <div className="map-caption">
                <div><span className="pulse-dot" /> Predicted state at {scenario.departure}</div>
                <div>Route geometry and demand are synthetic for the MVP</div>
              </div>
            </div>

            <div className="decision-stage">
              <DecisionHeader phase={phase} need={need} />
              {phase === 'measured' ? (
                <OutcomeReveal result={result} />
              ) : phase === 'remembered' ? (
                <RuleWritten rule={FIRST_EXCEPTION} />
              ) : (
                <>
                  <NeedSelector value={need} onChange={setNeed} locked={phase === 'replay'} />
                  <RouteList
                    routes={evaluatedRoutes}
                    selectedRoute={selectedRoute}
                    onSelect={setSelectedRoute}
                    phase={phase}
                  />
                  {(phase === 'first-pass' || phase === 'replay') && selected && (
                    <DecisionExplanation route={selected} need={need} phase={phase} />
                  )}
                </>
              )}

              <div className="decision-footer">
                <button className="primary-button full" onClick={nextAction}>
                  {phase === 'observe' && <>Run first-pass match <ArrowRight size={17} /></>}
                  {phase === 'first-pass' && <>Measure the outcome <Gauge size={17} /></>}
                  {phase === 'measured' && <>Write this boundary to Memory <Database size={17} /></>}
                  {phase === 'remembered' && <>Replay for Mia <RefreshCcw size={17} /></>}
                  {phase === 'replay' && <>Test the same Memory on a room <Building2 size={17} /></>}
                </button>
              </div>
            </div>
          </div>

          <ComparisonBand
            phase={phase}
            baseline={result.routeLoads}
            learned={learnedDistribution}
          />
        </section>

        <section className="architecture" id="architecture">
          <div className="architecture-intro">
            <span className="section-kicker">THE BACKEND IS THE PRODUCT ADVANTAGE</span>
            <h2>A decision becomes local operating knowledge.</h2>
            <p>
              The interface changes by user. The underlying object stays the same: a context, a demand, eligible capacity, a measured outcome and the boundary of where that outcome holds.
            </p>
          </div>
          <div className="architecture-flow" aria-label="Cremorne Memory architecture">
            <ArchitectureNode icon={<Eye />} number="01" title="Observe" detail="UV · demand · asset state" />
            <FlowArrow />
            <ArchitectureNode icon={<Gauge />} number="02" title="Predict" detail="State at time of use" />
            <FlowArrow />
            <ArchitectureNode icon={<History />} number="03" title="Retrieve" detail="Comparable local evidence" accent />
            <FlowArrow />
            <ArchitectureNode icon={<Workflow />} number="04" title="Match" detail="Graph + hard constraints" />
            <FlowArrow />
            <ArchitectureNode icon={<MousePointer2 />} number="05" title="Choose / test" detail="Worker or bounded pilot" />
            <FlowArrow />
            <ArchitectureNode icon={<Database />} number="06" title="Measure + learn" detail="Outcome · exception · confidence" accent />
          </div>
          <div className="architecture-foundation">
            <div>
              <Layers3 size={19} />
              <span><strong>Capacity Graph</strong> represents routes, spaces, time windows and their access rules.</span>
            </div>
            <div>
              <ShieldCheck size={19} />
              <span><strong>Constraint engine</strong> establishes eligibility before preferences are ranked.</span>
            </div>
            <div>
              <MemoryStick size={19} />
              <span><strong>Operational Memory</strong> retrieves outcomes only inside comparable conditions.</span>
            </div>
          </div>
          <div className="privacy-line">
            <span>Share constraints, not diagnoses.</span>
            <span>Share capacity, not calendars.</span>
            <span>Store outcomes, not identities.</span>
          </div>
        </section>

        <section className="story-section">
          <div className="story-copy">
            <span className="section-kicker">THE HUMAN REASON</span>
            <h2>Mia does not need a “special mode.”<br />She needs the right route to be eligible.</h2>
            <p>
              Mia shares one functional requirement—low UV. The system never needs her diagnosis. Once a comparable harm has been measured, it becomes part of the next eligibility decision.
            </p>
            <div className="functional-chip"><Sun size={16} /> LOW UV · REQUIRED</div>
          </div>
          <div className="storyboard">
            <figure>
              <div className="story-number">FIRST PASS</div>
              <img src="/illustrations/mia-before.png" alt="Mia facing a bright and crowded Church Street route" />
              <figcaption>Fast on average.<br /><strong>Too exposed for Mia.</strong></figcaption>
            </figure>
            <div className="story-arrow"><ArrowRight /></div>
            <figure>
              <div className="story-number">NEXT PASS</div>
              <img src="/illustrations/mia-after.png" alt="Mia using a shaded route through a covered arcade" />
              <figcaption>Comparable context retrieved.<br /><strong>Shadow Route C is eligible.</strong></figcaption>
            </figure>
          </div>
          <div className="story-closing">Cremorne has seen this before.</div>
        </section>
      </main>

      <footer>
        <div className="footer-brand"><span className="brand-mark"><span /></span> Cremorne Memory</div>
        <p>Use the capacity Cremorne already has. Learn from every outcome. Make the next decision better.</p>
        <a href="https://github.com/arkkn0/Team-Bubble" target="_blank" rel="noreferrer"><Code2 size={16} /> Open source prototype</a>
      </footer>

      {memoryOpen && (
        <MemoryDrawer rules={rules} onClose={() => setMemoryOpen(false)} onReplay={() => {
          setMemoryOpen(false)
          setNeed('low-uv')
          setPhase('replay')
          labRef.current?.scrollIntoView({ behavior: 'smooth' })
        }} />
      )}
      {workspaceOpen && <WorkspaceModal onClose={() => setWorkspaceOpen(false)} />}
    </div>
  )
}

function LearningRail({ phase }: { phase: DemoPhase }) {
  const active = phaseIndex(phase)
  return (
    <div className="learning-rail">
      {phases.map((item, index) => (
        <div className={`rail-step ${index <= active ? 'active' : ''}`} key={item.id}>
          <span>{index < active ? <Check size={14} /> : item.short}</span>
          <strong>{item.label}</strong>
          {index < phases.length - 1 && <i />}
        </div>
      ))}
    </div>
  )
}

function ScenarioBar({ scenario, phase }: { scenario: Scenario; phase: DemoPhase }) {
  return (
    <div className="scenario-bar">
      <div className="scenario-place"><MapPin size={17} /> Church Street · Cremorne</div>
      <div><Sun size={16} /><strong>UV {scenario.uvIndex}</strong><span>high</span></div>
      <div><CloudSun size={16} /><strong>{scenario.temperature}°C</strong><span>{scenario.weatherSource === 'live' ? 'live weather' : 'scenario'}</span></div>
      <div><Users size={16} /><strong>{scenario.crowding}%</strong><span>predicted load</span></div>
      <div className={`scenario-pass ${phase === 'replay' ? 'second' : ''}`}>
        {phase === 'replay' ? 'NEXT PASS' : 'FIRST PASS'}
      </div>
    </div>
  )
}

function PrecinctMap({
  routes,
  selectedRoute,
  phase,
  onSelect,
}: {
  routes: RouteEvaluation[]
  selectedRoute: RouteId
  phase: DemoPhase
  onSelect: (id: RouteId) => void
}) {
  const showMemory = phase === 'replay'
  return (
    <div className="precinct-map">
      <svg viewBox="0 0 760 430" role="img" aria-label="Simplified Cremorne route capacity map">
        <defs>
          <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#d8d0c1" strokeWidth="0.7" opacity="0.55" />
          </pattern>
          <filter id="rough">
            <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.2" />
          </filter>
        </defs>
        <rect width="760" height="430" fill="#f1eadf" />
        <rect width="760" height="430" fill="url(#grid)" />

        <g className="map-buildings" filter="url(#rough)">
          <path d="M22 38 H188 V142 H112 V184 H22 Z" />
          <path d="M224 26 H352 V152 H224 Z" />
          <path d="M396 18 H555 V142 H396 Z" />
          <path d="M596 20 H738 V160 H596 Z" />
          <path d="M20 232 H135 V400 H20 Z" />
          <path d="M180 286 H292 V410 H180 Z" />
          <path d="M346 250 H486 V410 H346 Z" />
          <path d="M548 236 H740 V406 H548 Z" />
        </g>
        <g className="map-building-labels">
          <text x="45" y="86">OFFICES</text>
          <text x="246" y="84">STUDIO</text>
          <text x="420" y="72">ARCADE</text>
          <text x="616" y="82">STATION</text>
          <text x="36" y="318">WORK</text>
          <text x="369" y="326">LOBBY</text>
          <text x="598" y="326">CDH</text>
        </g>
        <path className="church-street" d="M8 212 C182 194 306 214 446 172 C574 134 648 128 752 174" />
        <text className="street-label" x="278" y="190">CHURCH STREET</text>
        <path className="covered-zone" d="M395 213 L484 213 L514 178 L426 178 Z" />
        <text className="covered-label" x="410" y="237">COVERED LINK</text>

        {routes.map((route) => {
          const selected = route.id === selectedRoute
          const isFiltered = !route.eligible && showMemory
          return (
            <g
              key={route.id}
              className={`map-route ${selected ? 'selected' : ''} ${isFiltered ? 'filtered' : ''}`}
              onClick={() => onSelect(route.id)}
              role="button"
              tabIndex={0}
              aria-label={`Select ${route.name}`}
            >
              <path className="route-casing" d={route.path} />
              <path className="route-line" d={route.path} stroke={route.color} />
            </g>
          )
        })}

        <g className="origin-marker">
          <circle cx="86" cy="342" r="17" />
          <circle cx="86" cy="342" r="6" />
          <text x="54" y="380">MIA</text>
        </g>
        <g className="destination-marker">
          <circle cx="680" cy="72" r="17" />
          <path d="M673 72 l5 5 10 -12" />
          <text x="642" y="110">OFFICE</text>
        </g>

        {showMemory && (
          <g className="memory-map-callout">
            <path d="M514 268 C555 248 573 230 590 200" />
            <rect x="488" y="265" width="232" height="76" rx="12" />
            <text x="508" y="291">LOCAL RULE RETRIEVED</text>
            <text x="508" y="316">Route B exceeds Mia’s UV limit.</text>
          </g>
        )}
      </svg>
      <div className="map-legend">
        {ROUTES.map((route) => <button key={route.id} onClick={() => onSelect(route.id)}><i style={{ background: route.color }} /> Route {route.id}</button>)}
      </div>
    </div>
  )
}

function DecisionHeader({ phase, need }: { phase: DemoPhase; need: FunctionalNeed }) {
  const copy: Record<DemoPhase, { overline: string; title: string; text: string }> = {
    observe: {
      overline: 'OBSERVE',
      title: 'A mismatch is forming.',
      text: 'Church Street is predicted to reach 82% load as UV remains high. Three route-time capacity units are available.',
    },
    'first-pass': {
      overline: 'PREDICT + MATCH',
      title: 'Route B wins the first pass.',
      text: 'Generic logic sees a fast, less crowded route. The first pass has no comparable local exception to retrieve.',
    },
    measured: {
      overline: 'MEASURE',
      title: 'The average hides two worse journeys.',
      text: 'The intervention improves aggregate movement. Outcome distribution tells a different story.',
    },
    remembered: {
      overline: 'LEARN',
      title: 'The boundary becomes reusable.',
      text: 'Cremorne stores the context, outcome and exception—not a blanket claim that Route B works.',
    },
    replay: {
      overline: 'RETRIEVE + MATCH',
      title: 'Same conditions. Better eligible set.',
      text: `Memory qualifies the prediction before options are shown for: ${needLabels[need]}.`,
    },
  }
  return (
    <div className="decision-header">
      <span>{copy[phase].overline}</span>
      <h3>{copy[phase].title}</h3>
      <p>{copy[phase].text}</p>
    </div>
  )
}

function NeedSelector({ value, onChange, locked }: { value: FunctionalNeed; onChange: (value: FunctionalNeed) => void; locked: boolean }) {
  const needs: FunctionalNeed[] = ['standard', 'low-uv', 'step-free']
  return (
    <div className="need-selector">
      <label>Mia’s hard requirement</label>
      <div>
        {needs.map((need) => (
          <button key={need} className={value === need ? 'active' : ''} onClick={() => !locked && onChange(need)} disabled={locked && value !== need}>
            {need === 'low-uv' && <Sun size={14} />}
            {need === 'step-free' && <Footprints size={14} />}
            {need === 'standard' && <Clock3 size={14} />}
            {needLabels[need]}
          </button>
        ))}
      </div>
    </div>
  )
}

function RouteList({ routes, selectedRoute, onSelect, phase }: { routes: RouteEvaluation[]; selectedRoute: RouteId; onSelect: (id: RouteId) => void; phase: DemoPhase }) {
  const visible = phase === 'observe' ? routes.slice().sort((a, b) => a.id.localeCompare(b.id)) : routes
  return (
    <div className="route-list">
      {visible.map((route, index) => (
        <button
          key={route.id}
          className={`route-card ${selectedRoute === route.id ? 'selected' : ''} ${!route.eligible ? 'ineligible' : ''}`}
          onClick={() => onSelect(route.id)}
        >
          <span className="route-swatch" style={{ backgroundColor: route.color }} />
          <div className="route-card-main">
            <div className="route-title-row">
              <strong>{route.name}</strong>
              {phase !== 'observe' && index === 0 && route.eligible && <span className="best-label">BEST ELIGIBLE</span>}
              {!route.eligible && <span className="blocked-label">OUTSIDE SET</span>}
            </div>
            <span>{route.descriptor}</span>
            <div className="route-metrics">
              <span><Clock3 size={13} /> {route.minutes} min</span>
              <span><Sun size={13} /> UV {route.directUv}</span>
              <span><Users size={13} /> {route.capacity - route.predictedLoad} places left</span>
            </div>
          </div>
          <ChevronRight size={18} />
        </button>
      ))}
    </div>
  )
}

function DecisionExplanation({ route, need, phase }: { route: RouteEvaluation; need: FunctionalNeed; phase: DemoPhase }) {
  const replay = phase === 'replay'
  return (
    <div className={`explanation ${replay ? 'memory-aware' : ''}`}>
      <div className="explanation-top">
        {replay ? <MemoryStick size={17} /> : <Sparkles size={17} />}
        <strong>{replay ? 'Why this eligible set changed' : 'Why this ranks first'}</strong>
      </div>
      {replay && need === 'low-uv' ? (
        <p>A comparable Church Street outcome is in Memory. Route B is filtered before preference ranking; Shadow Route C stays within the UV and arrival constraints.</p>
      ) : (
        <p>{route.name} minimises predicted walking time and crowding for the generic first pass. Its exposed crossing is still treated as an estimate.</p>
      )}
      <div className="reason-chips">
        {route.reasons.slice(0, 2).map((reason) => <span key={reason}><Check size={12} /> {reason}</span>)}
      </div>
    </div>
  )
}

function OutcomeReveal({ result }: { result: ReturnType<typeof simulateScenario> }) {
  return (
    <div className="outcome-reveal">
      <div className="aggregate-result">
        <span>AGGREGATE OUTCOME</span>
        <div><strong>{result.crowdingDelta}%</strong><small>peak crowding</small></div>
        <div><strong>{result.walkingDelta}%</strong><small>walking time</small></div>
        <i>Synthetic MVP output</i>
      </div>
      <div className="missed-title">WHO DID WE MISS?</div>
      <div className="missed-grid">
        <div>
          <span className="cohort-icon sun"><Sun /></span>
          <p>LOW-UV COHORT</p>
          <strong>+{result.uvDeltaLowUv}%</strong>
          <small>direct UV exposure</small>
        </div>
        <div>
          <span className="cohort-icon mobility"><Footprints /></span>
          <p>MOBILITY-CONSTRAINED</p>
          <strong>+{result.mobilityFrictionDelta}%</strong>
          <small>travel friction</small>
        </div>
      </div>
      <p className="outcome-note">The first result is useful evidence. Its exception tells us where that result stops being safe to reuse.</p>
    </div>
  )
}

function RuleWritten({ rule }: { rule: MemoryRule }) {
  return (
    <div className="rule-written">
      <div className="rule-stamp"><Check size={22} /> OPERATING RULE WRITTEN</div>
      <div className="rule-equation">
        <span>CONTEXT</span><b>+</b><span>CAPACITY</span><b>+</b><span>OUTCOME</span><b>+</b><span>EXCEPTION</span>
      </div>
      <div className="rule-card-inner">
        <div><span>When</span><strong>Church St · UV ≥ {rule.context.uvMin} · crowding ≥ {rule.context.crowdingMin}%</strong></div>
        <div><span>Evidence</span><strong>Route B reduced crowding {Math.abs(rule.outcome.crowdingDelta)}% and walking time {Math.abs(rule.outcome.walkingDelta)}%</strong></div>
        <div className="exception-row"><span>Except</span><strong>Low-UV travel: exposure +{rule.exception.delta}%</strong></div>
        <div><span>Boundary</span><strong>{rule.deploymentBoundary}</strong></div>
      </div>
      <div className="confidence-row"><span>SIMULATION EVIDENCE</span><i><b style={{ width: `${rule.confidence * 100}%` }} /></i><strong>{Math.round(rule.confidence * 100)}% prototype confidence</strong></div>
    </div>
  )
}

function ComparisonBand({ phase, baseline, learned }: { phase: DemoPhase; baseline: Record<RouteId, number>; learned: Record<RouteId, number> }) {
  const replay = phase === 'replay'
  return (
    <div className={`comparison-band ${replay ? 'visible' : ''}`}>
      <div className="comparison-title">
        <span>{replay ? 'SAME DEMAND · SAME CONDITIONS' : 'CONTROLLED COMPARISON'}</span>
        <strong>{replay ? 'Different decision logic. A measurable second outcome.' : 'The next pass will reuse exactly the same scenario.'}</strong>
      </div>
      <Distribution label="First pass" values={baseline} />
      <ArrowRight size={22} />
      <Distribution label="Memory-aware" values={learned} muted={!replay} />
      <div className="comparison-callout">
        <strong>{replay ? '100%' : '—'}</strong>
        <span>represented hard constraints passed</span>
      </div>
    </div>
  )
}

function Distribution({ label, values, muted }: { label: string; values: Record<RouteId, number>; muted?: boolean }) {
  const total = values.A + values.B + values.C
  return (
    <div className={`distribution ${muted ? 'muted' : ''}`}>
      <span>{label}</span>
      <div className="distribution-bar">
        <i className="a" style={{ width: `${(values.A / total) * 100}%` }} />
        <i className="b" style={{ width: `${(values.B / total) * 100}%` }} />
        <i className="c" style={{ width: `${(values.C / total) * 100}%` }} />
      </div>
      <small>A {values.A} · B {values.B} · C {values.C}</small>
    </div>
  )
}

function ArchitectureNode({ icon, number, title, detail, accent }: { icon: React.ReactNode; number: string; title: string; detail: string; accent?: boolean }) {
  return (
    <div className={`architecture-node ${accent ? 'accent' : ''}`}>
      <span className="node-number">{number}</span>
      <span className="node-icon">{icon}</span>
      <strong>{title}</strong>
      <small>{detail}</small>
    </div>
  )
}

function FlowArrow() {
  return <div className="flow-arrow"><ChevronRight /></div>
}

function MemoryDrawer({ rules, onClose, onReplay }: { rules: MemoryRule[]; onClose: () => void; onReplay: () => void }) {
  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="memory-drawer">
        <button className="icon-close" onClick={onClose} aria-label="Close Memory"><X /></button>
        <div className="drawer-title"><MemoryStick /><span>CREMORNE MEMORY</span><h3>Local operating rules</h3></div>
        {rules.length === 0 ? (
          <div className="empty-memory">
            <Database size={32} />
            <h4>No local rule yet.</h4>
            <p>Run the first-pass intervention and measure its outcome. The result becomes the first reusable Memory record.</p>
          </div>
        ) : (
          <div className="memory-records">
            {rules.map((rule) => (
              <article key={rule.id}>
                <div className="record-head"><span>SIMULATION EVIDENCE</span><strong>{Math.round(rule.confidence * 100)}% confidence</strong></div>
                <h4>High-UV Church Street redistribution</h4>
                <div className="record-line"><span>CONTEXT</span><p>UV ≥ {rule.context.uvMin} · crowding ≥ {rule.context.crowdingMin}%</p></div>
                <div className="record-line"><span>OUTCOME</span><p>Crowding {rule.outcome.crowdingDelta}% · walking {rule.outcome.walkingDelta}%</p></div>
                <div className="record-line exception"><span>EXCEPTION</span><p>Low-UV exposure +{rule.exception.delta}%</p></div>
                <div className="record-line"><span>BOUNDARY</span><p>{rule.deploymentBoundary}</p></div>
              </article>
            ))}
            <button className="primary-button full" onClick={onReplay}>Use this rule in the next pass <ArrowRight size={17} /></button>
          </div>
        )}
      </aside>
    </div>
  )
}

function WorkspaceModal({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState('studio')
  const rooms = [
    { id: 'internal', name: 'Own tenancy · Room 4', seats: 4, hybrid: true, access: 'OWN', status: 'Too small' },
    { id: 'studio', name: 'CDH · Studio 2', seats: 8, hybrid: true, access: 'CDH', status: 'Best eligible' },
    { id: 'partner', name: 'Partner · Boardroom', seats: 10, hybrid: true, access: 'PARTNER', status: 'Poor acoustics in Memory' },
  ]
  return (
    <div className="overlay workspace-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="workspace-modal">
        <button className="icon-close" onClick={onClose} aria-label="Close workspace example"><X /></button>
        <div className="workspace-heading">
          <span className="section-kicker">SAME MEMORY · DIFFERENT CAPACITY</span>
          <h3>Find a six-person hybrid room.<br /><em>Tuesday · 2:00–3:00 pm</em></h3>
          <p>The graph checks eligibility before preference: seats, hybrid equipment, accessibility and authorised access.</p>
        </div>
        <div className="workspace-body">
          <div className="workspace-query">
            <div><Users size={17} /><span>6 people</span></div>
            <div><KeyRound size={17} /><span>Authorised access</span></div>
            <div><ShieldCheck size={17} /><span>Step-free</span></div>
            <div><Workflow size={17} /><span>Hybrid equipment</span></div>
          </div>
          <div className="room-list">
            {rooms.map((room) => {
              const eligible = room.id !== 'internal'
              return (
                <button key={room.id} className={`${selected === room.id ? 'selected' : ''} ${!eligible ? 'ineligible' : ''}`} onClick={() => eligible && setSelected(room.id)}>
                  <span className="room-icon"><Building2 /></span>
                  <div><strong>{room.name}</strong><small>{room.seats} seats · Teams enabled · step-free</small></div>
                  <span className={`room-status ${room.id === 'studio' ? 'best' : ''}`}>{room.status}</span>
                </button>
              )
            })}
          </div>
          <div className="workspace-memory">
            <MemoryStick size={20} />
            <div><strong>Why Studio 2?</strong><p>Both external rooms pass the hard requirements. A comparable hybrid meeting recorded poor acoustic outcomes in the Boardroom, so Studio 2 ranks first.</p></div>
          </div>
        </div>
        <div className="workspace-footer"><span>Capacity, not calendars.</span><strong>Owner-defined availability only</strong></div>
      </div>
    </div>
  )
}

export default App
