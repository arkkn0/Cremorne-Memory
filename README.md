# Cremorne Memory

**A context-aware capacity and learning layer for Cremorne.**

**Live product:** https://team-bubble.vercel.app/

Cremorne Memory turns fragmented precinct signals into guided actions. A worker describes an outcome in one brief; the product combines that need with weather, demand, time, capacity, access rules and local Memory to produce an eligible route × departure-time or room × time action. CDH can test an intervention, measure aggregate and cohort outcomes, store the boundary of success, and use that evidence in the next decision.

## Product surfaces

- `/` — concise product landing page that explains one outcome and one four-step flow
- `/app` — one product with a judge-first entry flow and two working surfaces:
  - **Live demo:** a 30-second, four-step proof that a measured exception changes the next eligible set
  - **Worker Guide:** describe a goal in natural language, choose a dynamically eligible route × departure-time or workspace action, then record actual completion and lightweight outcome feedback as evidence
  - **CDH Experiment:** define an intervention brief, run a controlled baseline comparison, measure precinct and subgroup effects, then publish an exception-aware operating rule
- `/api/decision` — deterministic serverless decision endpoint used by the demonstrator
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

Mia's journey is the hero application: a Cremorne worker with albinism, photosensitivity and low vision. Her route matching includes direct UV, glare, covered passages, arrival time and high-contrast guidance. Her workspace matching includes adjustable blinds, low-glare lighting and meeting equipment. The engine stores functional requirements rather than a medical diagnosis. Sub-minute hackathon interactions are recorded but excluded from the travel-time score; real observed duration contributes once the journey exceeds one minute.

## Two Memory loops

- **Personal Memory:** observed completion time and worker feedback adjust the next route ranking for comparable journeys.
- **Precinct Memory:** CDH publishes a rule only after a controlled comparison measures the average effect, subgroup guardrails and confidence.

## What is measured

The CDH experiment holds demand, conditions and seed constant while the decision API compares two allocations:

1. the current flow across Routes A, B and C;
2. a tested redistribution across the same three routes.

The API returns both allocations, their aggregate and cohort outcomes, and a candidate operating rule. Publishing that rule stores the measured context, outcome and exception in browser Memory. The Worker Guide then consumes that exact rule object: when Mia's low-UV requirement and the current UV match its boundary, Route B leaves the eligible set before ranking.

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

The working prototype uses typed TypeScript modules and browser persistence so the complete loop remains usable without external credentials. The serverless endpoint exposes the same deterministic rule logic.

`Capacity Graph` describes the current product data model; it does not claim a live Neo4j deployment. Neo4j is a compatible production persistence path for context, capacity, outcomes and exceptions. GraphRAG or an LLM can later translate unstructured policies and free text into structured constraints or explanations, while deterministic eligibility and measured outcomes remain the source of decisions.

The three-stage illustrated Mia journey for the pre-screening deck is saved at `docs/pitch-assets/mia-user-journey-triptych.png`.

## Run

```bash
npm install
npm run data:build
npm run dev
```

Open `http://localhost:4173` and select **Try the product**.

## Verify

```bash
npm run lint
npm test
npm run build
```

## Deployment

The repository is configured for Vercel. Import the GitHub repository, keep the default Vite settings, and deploy. `/app` is rewritten to the single-page client while `/api/*` remains available to Vercel Functions.
