# Cremorne Memory

**A context-aware capacity and learning layer for Cremorne.**

**Live product:** https://team-bubble.vercel.app/

Cremorne Memory turns fragmented precinct evidence into guided actions. A worker describes an outcome in one brief; the product combines that need with time, access, public route and venue evidence, current conditions, and validated local Memory. CDH can measure a bounded pilot, review repeated evidence, store the boundary of success, and use it in the next comparable decision.

## Product surfaces

- `/` — concise product landing page that explains one outcome and one four-step flow
- `/app` — one product with three connected views:
  - **Live Proof:** a 30-second real-data walkthrough of one documented hotspot, two public pedestrian routes, Mia's functional need, and the field measurements required before a rule can be published
  - **Worker App:** describe a goal in natural language, choose a dynamically eligible route × departure-time or workspace action, follow live guidance, and record the outcome
  - **CDH Lab:** inspect the real public baseline, define the field outcome, and review repeated room or route evidence before it becomes shared guidance
- `/api/decision` — one serverless endpoint for natural-language parsing, graph-grounded recommendation, outcome writes, candidate-route review, and repeated workspace-issue review
- `/api/health` — deployment health endpoint

No account or login is required. The Live Proof does not create evidence. Memory is created only by recorded worker outcomes and validated CDH evidence.

## Dynamic guidance model

```text
worker brief + fragmented precinct signals
                    ↓
        structured need at time of use
                    ↓
     eligible capacity + verified availability
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
- **Workspace:** people, time, equipment, environmental controls and accessibility → capability match → owner-confirmed room × time window.

Mia's journey is the hero application: a Cremorne worker with albinism and photosensitivity. Her route request stores one functional requirement—low UV—rather than a diagnosis. The current public-data match compares travel time and Vicmap canopy adjacency; the pilot adds measured direct-sun minutes and crossing wait.

During a journey, the Worker App can record the walked geometry with explicit location permission. If a worker reports a better experience on a path that materially differs from the known route, they may share it as a `CandidateRoute`. Candidate paths stay outside the eligible set until CDH validates them; this lets real use discover small lanes or passages without turning one person’s trace into precinct guidance.

The candidate lifecycle is implemented through the existing Decision API:

```text
better journey + shared trace
          ↓
CandidateRoute (candidate)
          ↓
CDH review + supporting evidence
          ↓
validated → rankable CapacityUnit
rejected  → retained as evidence, excluded from ranking
```

`candidate-routes` lists reviewable paths and `candidate-route-review` validates or rejects one. A validated path keeps its recorded geometry, inherits the source route's operational fields, accepts reviewed evidence such as duration, shade and safe capacity, and becomes discoverable through the same graph query as Routes A, B and C.

## Two Memory loops

- **Personal Memory:** observed completion time and worker feedback adjust the next route ranking for comparable journeys.
- **Precinct Memory:** CDH publishes a rule only after a controlled comparison measures the average effect, subgroup guardrails and confidence.

Workspace feedback follows the same evidence boundary. One report updates only that worker's Personal Memory. Reports from multiple independent profiles create a review candidate. A CDH validation is required before the issue becomes cohort evidence and reweights future room recommendations for the relevant requirement.

## What is measured

The real-data pilot starts at the Cremorne Street × Swan Street gateway, where Yarra recorded **5,149 pedestrian movements across the surveyed AM and PM peak periods**. The current route baseline is reproducible from Valhalla/OpenStreetMap and Vicmap trees:

- Direct Route B to East Richmond: **8.4 minutes, 12% canopy-adjacent geometry**.
- Shadow Route C: **9.0 minutes, 28% canopy-adjacent geometry**.
- The trade-off is **36 seconds for 16 percentage points more canopy adjacency**.

The field pilot then records actual journey time, crossing wait, direct-sun minutes, the functional need, and Better/Same/Worse feedback. Those observed values—not a seeded result—are the evidence from which a Memory rule can be reviewed and published.

## Evidence model

The interface distinguishes three kinds of evidence:

| Status | Used for |
| --- | --- |
| Current context | Cremorne-coordinate forecast when available; future ARPANSA / Yarra feed adapters |
| Public baseline | Yarra pedestrian counts and smart-pole locations, DTP station patronage, Vicmap urban trees, OpenStreetMap pedestrian geometry, public CDH venue capability |
| Pilot outcome | actual journey time, crossing wait, direct-sun minutes, worker feedback, owner-provided room availability |

If a functional requirement cannot be supported by the available evidence, the product exposes a coverage gap. For example, step-free routing is withheld until kerb, crossing and gradient evidence is verified.

## Data sources

- [City of Yarra Cremorne Streets and Movement Strategy](https://www.yarracity.vic.gov.au/sites/default/files/2024-05/cremorne_streets_and_movement_strategy_final_june2020_with_appendices.pdf)
- [City of Yarra Cremorne smart poles](https://www.yarracity.vic.gov.au/about-us/news-and-media/smart-poles-coming-to-cremorne)
- [DTP annual metropolitan train station patronage FY24–25](https://opendata.transport.vic.gov.au/dataset/annual-metropolitan-train-station-patronage-station-entries)
- [DTP Victoria GTFS-Realtime](https://opendata.transport.vic.gov.au/dataset/gtfs-realtime)
- [ARPANSA ultraviolet radiation data](https://www.arpansa.gov.au/our-services/monitoring/ultraviolet-radiation-monitoring/ultraviolet-radation-data-information)
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
context + requirement graph retrieval → relevant observed outcomes and reviewed exceptions
        ↓
eligibility and evidence-aware ranking
        ↓
grounded, concise option explanation
        ↓
choice / field outcome → evidence review → next retrieval
```

Neo4j is used directly when `NEO4J_*` credentials are configured. An in-memory graph with the same repository contract keeps the project runnable for tests and offline review. The LLM parses and explains; graph constraints and observed evidence determine the eligible set and ranking. Route remaining-capacity claims stay unavailable until the Yarra/CDH smart-pole feed is connected.

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
npm run graph:verify-candidate
```

`graph:verify-candidate` uses the configured Neo4j instance to record a shared journey, retrieve the pending candidate, validate it, and verify that a comparable recommendation can retrieve the new Capacity Unit. It fails if any stage of that loop is disconnected.

## Deployment

The repository is configured for Vercel. Add the variables from `.env.example` in the Vercel project, then deploy. `/app` is rewritten to the single-page client while `/api/*` remains available to Node.js Vercel Functions. Use `https://team-bubble.vercel.app/app` for the submission QR so judges enter the Live Proof immediately.
