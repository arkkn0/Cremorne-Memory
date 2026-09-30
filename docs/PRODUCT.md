# Product definition

## The decision Cremorne cannot make today

Cremorne has movement and workspace capacity, but it is divided across streets, time windows, tenancies and operating systems. A route can be physically open yet unsuitable at the expected time of use. A room can be empty yet unavailable, inaccessible or poorly suited to the task.

Cremorne Memory treats each route, passage, room and time window as a **Capacity Unit**. A unit becomes eligible only when it satisfies the demand's hard requirements under predicted conditions.

```text
Demand × hard constraints × time × context → eligible capacity
```

Preference ranking happens after eligibility.

## Product surfaces

### Worker App

Answers one question: **Which options are genuinely usable for me at the time I will use them?**

The worker sees:

- eligible route × departure-time options;
- predicted travel time, crowding, exposure and remaining capacity;
- the reason an option is inside or outside the eligible set;
- relevant local evidence and its confidence;
- the final choice remains with the worker.
- the walked path can be visualised after arrival;
- a materially different path with a `Better` outcome may be shared as a candidate for later CDH validation.

### CDH Lab

Answers a different question through the same model: **Which bounded intervention should we test, and what did Cremorne learn from it?**

The precinct operator sees:

- current and predicted mismatch;
- route capacity and demand distribution;
- aggregate and functional-need outcomes;
- the resulting operating rule, exception and deployment boundary;
- evidence maturity from simulation through repeated local deployment.

### Participating-asset view

Owners expose bounded metadata rather than unrestricted access:

- availability window;
- safe capacity;
- authorised access class;
- accessibility and facilities;
- optional booking or price rules.

Owners define access. Workers choose. Memory learns.

## First release

The first release is the Shadow Network: three movement options around a high-UV Church Street scenario, including one participating covered link. The second use case is a small workspace query that proves the same graph and Memory structure applies to rooms.

Vehicle optimisation, parking, noise routing and precinct-wide building integration sit outside the first build. They can enter later as new context signals or Capacity Unit types without changing the core loop.

## Outcome model

The primary measure is **Friction Minutes Removed per Worker**, evaluated with hard environmental and accessibility requirements.

Supporting measures include:

- peak route density;
- travel and waiting time;
- relative UV exposure;
- remaining capacity;
- functional-requirement pass rate;
- workers experiencing deterioration;
- intervention cost and evidence confidence.

The MVP uses controlled synthetic outputs. A field pilot replaces those outputs with anonymous counts, travel time, crossing delay, environmental measurement and lightweight opt-in feedback.
