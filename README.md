# Cremorne Memory

**A context-aware capacity and learning layer for the one-square-kilometre precinct.**

Cremorne Memory predicts capacity mismatches, matches workers with genuinely usable capacity, and turns every measured intervention into reusable local operating knowledge.

The working prototype follows one end-to-end story:

1. A high-UV, high-crowding Church Street scenario is observed.
2. Generic first-pass logic selects the fast route.
3. A controlled synthetic intervention measures the aggregate result and the outcome distribution.
4. The local exception is written to persistent browser Memory.
5. The same context is replayed for Mia, whose hard requirement is low UV exposure.
6. The stored exception changes eligibility before preferences are ranked.
7. The same capacity and Memory model is tested on a six-person hybrid room query.

## Product model

```text
Demand × hard constraints × time × context → eligible capacity
```

A Capacity Unit is a route, passage, room or time window evaluated under defined operating conditions. Empty, available and usable are deliberately different states.

The decision loop is:

```text
Observe → Predict → Retrieve → Match → Explain → Choose/Test → Measure → Learn
```

The MVP keeps the three forms of intelligence separate:

- **Prediction** estimates route state at the expected time of use.
- **Constraints** determine which options are eligible.
- **Memory** qualifies predictions with measured local outcomes and their applicability boundaries.

## What is working

- Responsive worker and precinct experience
- Simplified interactive Cremorne capacity map
- Deterministic 100–500 worker scenario engine
- First-pass and Memory-aware route ranking
- Hard-constraint filtering for low-UV and step-free needs
- Remaining-capacity-aware scoring
- Outcome distribution across represented functional needs
- Persistent Memory write and retrieval using browser storage
- Structured exception, confidence and deployment-boundary record
- Controlled baseline replay using the same demand, conditions and seed
- Workspace-capacity generalisation
- Live temperature adapter using Open-Meteo, with an offline scenario fallback
- Deployable decision API (`/api/decision`) exposing the same deterministic eligibility and ranking engine
- Health endpoint (`/api/health`)
- Automated decision-engine tests

All prototype impact values are explicitly labelled as synthetic. The application does not claim field-validated performance.

## Architecture

```text
Public / synthetic inputs
        ↓
Live precinct state
        ↓
Lightweight prediction
        ↓
Capacity Graph + deterministic constraint engine
        ↓                         ↑
Worker / precinct decision ← local Memory retrieval
        ↓
Outcome measurement
        ↓
Operating rule: context + outcome + exception + boundary + confidence
        └─────────────────────────↺
```

The hackathon build packages this architecture as typed TypeScript modules so the complete proof runs without external credentials or infrastructure. Browser storage provides visible, persistent Memory for the demo. A production deployment can replace that adapter with Neo4j while preserving the same `MemoryRule` model and deterministic eligibility layer.

## Repository structure

```text
src/
  App.tsx          Product experience and connected views
  domain.ts       Capacity, scenario, outcome and Memory types
  engine.ts       Prediction, constraint, matching and simulation logic
  memory.ts       Persistent Memory adapter
  engine.test.ts  Behavioural proof of the key decision change
  styles.css      Responsive visual system
public/
  illustrations/  Original hand-drawn precinct and Mia story assets
api/
  decision.ts     Serverless decision endpoint
  health.ts       Deployment health endpoint
```

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:4173`.

## Verify

```bash
npm test
npm run build
```

## Evidence and data maturity

The current network, pedestrian demand, shade values, route exposure and outcomes are synthetic prototype inputs. Live temperature is fetched from the public Open-Meteo endpoint when available. The interface distinguishes synthetic output from live context.

The deployment path is deliberately staged:

1. One hotspot, three routes, one participating covered asset and a small opt-in cohort.
2. Anonymous pedestrian counts, temporary environmental measures and route travel-time observations.
3. Additional participating passages, workspaces and repeated local outcomes.

## Privacy model

- Share constraints, not diagnoses.
- Share capacity, not calendars.
- Store outcomes, not identities.

Mia's profile stores `low UV required`; it does not require an albinism diagnosis.

## Open-source implementation references

The MVP adapts implementation patterns—not source code or visual identity—from public projects:

- [ShadeRouteNavigation](https://github.com/SY0604/ShadeRouteNavigation): time-specific shade and multi-objective pedestrian routing.
- [ShadowPath](https://github.com/ak-asu/shadowpath): transparent shade-aware route comparison and accessibility gates.
- [AeroTwin](https://github.com/helsingin/aerotwin): deterministic TypeScript simulation and replayable operating state.
- [Neo4j recommendations example](https://github.com/neo4j-graph-examples/recommendations): graph-neighbourhood retrieval pattern.

## Technology

React · TypeScript · Vite · deterministic constraint and ranking engine · browser-local persistent Memory · Open-Meteo adapter · Vitest · Vercel

### Decision API example

```text
/api/decision?need=low-uv&memory=1&uv=8.2&crowding=82&workers=300
```

The response exposes the eligible set, score, remaining capacity, explanation and retrieved Memory rule for each route.

## Team

Team Bubble · University of Melbourne 2026 FEIT Hackathon Festival
