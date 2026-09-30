# Cremorne Memory

**A context-aware capacity and learning layer for Cremorne.**

**Live product:** https://team-bubble.vercel.app/

Cremorne Memory turns fragmented precinct signals into guided actions. A worker describes an outcome in one brief; the product combines that need with weather, demand, time, capacity, access rules and local Memory to produce an eligible route × departure-time or room × time action. CDH can test an intervention, measure aggregate and cohort outcomes, store the boundary of success, and use that evidence in the next decision.

## Product surfaces

- `/` — concise product landing page that explains one outcome and one four-step flow
- `/app` — one product with three connected views:
  - **Live Proof:** a 30-second, four-step proof that a measured exception changes the next eligible set
  - **Worker App:** describe a goal in natural language, choose a dynamically eligible route × departure-time or workspace action, follow live guidance, and record the outcome
  - **CDH Lab:** define an intervention, run a controlled baseline comparison, measure precinct and cohort effects, then publish the discovered boundary to Memory
- `/api/decision` — one serverless endpoint for natural-language parsing, graph-grounded recommendation, controlled experiments and outcome writes
- `/api/health` — deployment health endpoint

No account or login is required. The guided proof writes to the same Memory used by the Worker app and CDH lab; it is not a separate animation.

## Dynamic guidance model

```text
worker brief + fragmented precinct signals
                    ↓
        structured need at time of use
                    ↓
     eligible capacity + remaining capacity
                    ↓
      a small set of executable actions
                    ↓
      measured outcome + local Memory
                    └──── improves the next eligible set
```

The worker does not choose an implementation category such as **Internal** or **Shared**. Access class is evaluated behind the interface:

- private capacity stays within its tenant;
- only owner-declared shared capacity can be discovered across the precinct;
- the interface shows the source of an eligible room when it helps the worker act.

The same pattern drives both use cases:

- **Movement:** destination, deadline, functional need and time flexibility → route × departure time.
- **Workspace:** people, time, equipment, sun/glare controls and accessibility → eligible room × time window → confirmed booking.

Mia's journey is the hero application: a Cremorne worker with albinism, photosensitivity and low vision. Her route matching includes direct UV, glare, covered passages, arrival time and high-contrast guidance. Her workspace matching includes adjustable blinds, low-glare lighting and meeting equipment. The graph stores functional requirements rather than a medical diagnosis.

During a journey, the Worker App can record the walked geometry with explicit location permission. If a worker reports a better experience on a path that materially differs from the known route, they may share it as a `CandidateRoute`. Candidate paths stay outside the eligible set until CDH validates them; this lets real use discover small lanes or passages without turning one person’s trace into precinct guidance.

## Two Memory loops

- **Personal Memory:** observed completion time and worker feedback adjust the next route ranking for comparable journeys.
- **Precinct Memory:** CDH publishes a rule only after a controlled comparison measures the average effect, subgroup guardrails and confidence.

## What is measured

The CDH experiment holds demand, conditions and seed constant while the decision API compares two allocations:

1. the current flow across Routes A, B and C;
2. a tested redistribution across the same three routes.

The API returns both allocations, their aggregate and cohort outcomes, and a candidate operating rule. Publishing that rule writes the measured context, outcome, evidence and exception to Neo4j when configured. The Worker App retrieves that graph neighbourhood on the next comparable request: when Mia's low-UV requirement and current UV match the stored boundary, Route B leaves the eligible set before ranking.

The current intervention outputs are synthetic MVP measurements and are labelled that way in the product. They demonstrate the evaluation mechanism; they are not presented as field-validated impact.

## Evidence model

The interface distinguishes three kinds of evidence:

| Status | Used for |
| --- | --- |
| Forecast / live | Open-Meteo temperature and UV when available |
| Public baseline | DTP station patronage, Vicmap urban trees, OpenStreetMap pedestrian geometry, public CDH venue capacity |
| Modelled / synthetic | minute-level movement demand, route capacity, exposure estimate, intervention outcome and demonstration availability |

If a functional requirement cannot be supported by the available evidence, the product exposes a coverage gap. For example, step-free routing is withheld until kerb, crossing and gradient evidence is verified.

## Data sources

- [DTP annual metropolitan train station patronage FY24–25](https://opendata.transport.vic.gov.au/dataset/annual-metropolitan-train-station-patronage-station-entries)
- [Vicmap Vegetation — Tree Urban](https://discover.data.vic.gov.au/dataset/vicmap-vegetation-tree-urban-rest-api)
- [OpenStreetMap](https://www.openstreetmap.org/copyright) route geometry via Valhalla
- [Cremorne Digital Hub venue information](https://www.cremornedigitalhub.com.au/events/)
- [Open-Meteo](https://open-meteo.com/) hourly forecast adapter

Raw public inputs are retained under `public/data/raw/`. Run `npm run data:build` to reproduce the compact product context written to `public/data/cremorne-context.json` and `src/cremorne-context.json`.

## Architecture

```text
Public / forecast / participating inputs
                    ↓
            precinct state at time of use
                    ↓
        Capacity Graph + hard constraints
                    ↓                 ↑
           eligible options ← Memory retrieval
                    ↓
              human choice / test
                    ↓
       aggregate + cohort measurement
                    ↓
 context + outcome + exception + boundary
                    └─────────────────↺
```

The deployed backend is organised as one end-to-end flow:

```text
natural-language brief
        ↓
OpenAI Structured Outputs → structured demand
        ↓
Neo4j Capacity Graph → eligible route / room × time candidates
        ↓
context + requirement graph retrieval → relevant local outcomes and exceptions
        ↓
capacity-aware matching and ranking
        ↓
grounded, concise option explanation
        ↓
choice / controlled test → outcome write → next retrieval
```

Neo4j is used directly when `NEO4J_*` credentials are configured. An in-memory graph with the same repository contract keeps the project runnable for tests and offline review. The LLM parses and explains; graph constraints, capacity calculations and measured outcomes determine the eligible set and ranking.

The three-stage illustrated Mia journey for the pre-screening deck is saved at `docs/pitch-assets/mia-user-journey-triptych.png`.

## Run

```bash
npm install
npm run data:build
npm run graph:seed
npm run dev
```

Copy `.env.example` to `.env.local`, add your Neo4j and OpenAI-compatible credentials, then open `http://localhost:4173`. The Vite development server mounts the same `/api/decision` handler used by Vercel.

## Verify

```bash
npm run lint
npm test
npm run build
```

## Deployment

The repository is configured for Vercel. Add the variables from `.env.example` in the Vercel project, then deploy. `/app` is rewritten to the single-page client while `/api/*` remains available to Node.js Vercel Functions. Use `https://team-bubble.vercel.app/app` for the submission QR so judges enter the Live Proof immediately.
