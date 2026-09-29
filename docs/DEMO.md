# 90-second judge demo

## 0:00 — The reframe

Open the landing page.

“Cremorne already has routes, covered passages and rooms. The missing layer is the ability to identify what is genuinely usable now—and remember the outcome.”

Point once to **Live State → Capacity Graph → Memory**, then select **Try the 30-second demo**.

## 0:12 — Same scenario

The product opens directly on:

- high UV;
- rising crowding;
- 300 workers;
- Mia, one worker with a low-UV requirement.

“CDH first tests whether Route B can relieve the precinct-wide crowd. Mia is one of the 300 workers represented.”

Select **Run aggregate test**.

## 0:27 — Apparent success

“The controlled run holds demand, UV and seed constant. Route B reduces crowding by 20% and average walking time by 7%. It looks successful.”

Select **Who did we miss?**

## 0:42 — The reveal

“The average hid two failures: estimated exposure rises 40% for the represented low-UV cohort and mobility friction rises 15%. An average success is not a safe universal rule.”

Select **Remember the exception**.

## 0:58 — The next decision

The route diagram visibly changes: Route B becomes a faded dashed path; Shadow Route C becomes the active eligible path.

“The outcome becomes an operating rule. Under the same high-UV context, Route B is filtered before ranking for Mia and Shadow Route C enters her eligible set.”

Select **Continue as Mia**.

## 1:15 — Prove it is a working product

The Worker app opens with the stored rule active. Select **Find eligible routes** to confirm the same route-level decision, or switch to **Find a room** to show the same capacity model applied to opted-in workspace.

If a judge asks for engineering detail, open **CDH lab**, replay the controlled experiment, and expand **Show decision trace**. The deployed build calls the serverless decision API; the local build uses the identical deterministic engine.

## 1:28 — Close

“Prediction estimates what may happen. Cremorne Memory turns what actually happened into a better next decision.”
