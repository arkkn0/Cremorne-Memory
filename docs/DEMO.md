# 90-second judge demo

Open `https://team-bubble.vercel.app/app`.

## 0:00 — Live Proof

The opening state fixes one comparable scenario: 300 workers, high UV, rising Church Street crowding and Mia’s low-UV need.

1. Select **Run the test**.
2. Point to the apparent result: crowding −20%, average walking time −7%.
3. Select **Who did we miss?**
4. Reveal low-UV exposure +40% and mobility friction +15%.
5. Select **Remember the exception**.

“The outcome does not become a success badge. It becomes a reusable boundary.”

## 0:35 — Next decision

Route B leaves Mia’s eligible set and Shadow Route C becomes eligible. Select **Continue as Mia**.

The Worker App uses normal language, current context, the Capacity Graph and retrieved Memory in one decision. Select **Find guided actions** and show:

- destination and deadline resolved from the brief;
- only eligible route × departure-time actions ranked;
- predicted demand and remaining capacity;
- the local high-UV exception changing Mia’s result.

## 0:55 — Outcome and path discovery

Start live guidance. The map follows journey progress and records GPS only after browser permission. At arrival the app draws the walked path and asks for Better / Same / Worse feedback.

If a Better path materially differs from known routes, the worker may select **Share path**. Neo4j stores it as a `CandidateRoute` for CDH validation; it does not immediately enter everyone’s eligible set.

## 1:10 — Same graph, different capacity

Select **Find a room** and search:

> Find a 4-person hybrid room at 2pm for 45 minutes with a display, adjustable blinds and low-glare lighting.

Show the full availability interval, capacity, equipment and “Why this room” explanation. Shared rooms appear only in owner-opened windows; private rooms remain internal.

## 1:25 — Engineering proof

Open **CDH Lab**. Run the controlled comparison and publish the discovered boundary. The result is written to graph Memory and is retrieved by the Worker App’s next comparable request.

Final line: “Prediction sees the next mismatch. Memory makes the next decision better.”
