# Cremorne Memory

**A context-aware capacity and learning layer for Cremorne.**

Cremorne Memory combines a public-facing product story with a working decision prototype. Workers can compare route capacity under a functional need; CDH can run a controlled intervention, measure aggregate and cohort outcomes, store the boundary of success, and replay the same context with that evidence active.

## Product surfaces

- `/` — concise product landing page that explains one outcome and one four-step flow
- `/app` — one product with a judge-first entry flow and two working surfaces:
  - **Live demo:** a 30-second, four-step proof that a measured exception changes the next eligible set
  - **Worker:** set a functional requirement, choose an eligible route, start the trip, arrive and record lightweight feedback; or find and hold an eligible workspace
  - **CDH operator:** detect a hotspot, test one intervention under controlled conditions, compare aggregate and cohort outcomes, then save an exception-aware operating rule
- `/api/decision` — deterministic serverless decision endpoint used by the demonstrator
- `/api/health` — deployment health endpoint

No account or login is required. The guided proof writes to the same Memory used by the Worker app and CDH lab; it is not a separate animation.

## What is measured

The demonstrator holds demand, conditions and seed constant, then compares two decision logics:

1. a first pass that optimises aggregate outcomes;
2. a Memory-aware pass that applies a previously measured exception before matching.

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

The prototype uses typed TypeScript modules and browser persistence so the complete loop is visible without external credentials. The serverless endpoint exposes the same deterministic rule logic. A production graph store can replace the persistence adapter without changing the decision model.

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
