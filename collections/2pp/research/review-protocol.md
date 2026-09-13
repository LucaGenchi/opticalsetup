# Review protocol

Original-branch reviewers assess the exact saved head of each scene without
editing its worktree. They read the scene evidence note and primary source,
run the native tracer, and inspect the real browser at desktop and about
1024 px. Reviews include meaningful controls, console findings, optical
train, conjugacy where applicable, reported versus inferred settings, and
misleading visual claims. Shared components are owned by the integration,
not independently redesigned by paper reviewers.

Use eight scores from 0 to 5. The first six increase with quality; the final
two increase with burden. They are not a simple additive ranking.

| Axis | 0 | 5 |
| --- | --- | --- |
| Source completeness | Unverified apparatus | Complete primary apparatus evidence |
| Optical-train confidence | Speculative | Strongly grounded topology and planes |
| Distinctiveness | Duplicates the Basic scene or stronger paper | Teaches a separate mechanism |
| 2D compatibility | Essential mechanism cannot be represented honestly | Native geometric behavior directly teaches the mechanism |
| Educational value | Little causal insight | Useful, clear control experiments |
| Visual clarity | Unreadable or misleading | Legible, compact, coherent layout |
| Free interpretation required | Almost none | Major invented prescription or dimensional rescaling |
| Maintenance complexity | Simple shared components | Substantial custom behavior and fragile coupling |

Each original review ends with **KEEP**, **KEEP AFTER REWORK**, or **DROP**,
with a concise reason. The coordinator chooses five only after all eleven
reports exist. Nanoscribe GT is removed by explicit user instruction whatever
its score. The score measures the reviewed original, not promised rework.

The final integrated review uses six fresh browser reviewers. Each checks
the integrated commit, visual consistency, clipping, labels, frame fit,
device frames, animation semantics, three useful controls, persistence,
console, and both viewport sizes. Screenshots must come from the real native
app. A source-rendered SVG does not substitute for browser evidence.

The development fixture `tools/review-2pp.html` embeds the actual editor in a
1280 × 800 or 1024 × 800 viewport; it does not implement another renderer.
Original-mode URLs pin the eleven branch hashes. Integrated mode uses the
same commit as the fixture. Public GitHub commit previews are used where the
browser cannot reach the local development server.
