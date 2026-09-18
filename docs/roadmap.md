# OpticalSetup roadmap: from sketch tool to trusted estimator

Status: proposed 2026-09-19, following the whole-project review in
[issue #170](https://github.com/LucaGenchi/opticalsetup/issues/170).
Decisions are Luca's; this document records the plan and its reasoning so
that every pull request can point at the step it implements.

## The goal in one sentence

Keep OpticalSetup the fastest way to draw an optical setup, and make every
number it reports something a researcher can trust, because each number says
how it was obtained, against what it was checked, and where the model stops.

## What "trusted" means here

A quantity the app reports is **validated** when all five hold:

1. **Model statement.** The physics is written down: equations, assumptions,
   the parameter ranges inside which it applies, and a citation. Today this
   lives in the wiki and in README paragraphs; it should live next to the code.
2. **Independent reference.** A second implementation, written separately
   (analytic formula, published worked example, or a Python reference under
   `validation/`), reproduces the number.
3. **Tolerance and test.** The agreement is asserted by a test with a stated
   tolerance, and the test runs in CI on every pull request.
4. **Fidelity label.** The app shows, next to the number, whether it is
   *diagram-only*, *qualitative*, an *estimate*, or *computed and validated*,
   and why it degrades when it does.
5. **Bounded.** Outside the stated ranges the app says "unavailable" with the
   reason, never a silently extrapolated value.

Everything below is ordered so that each step makes one more of these true
for one more part of the code, without breaking the live site.

## Phase 0: foundations (this batch of pull requests)

| Step | Deliverable | Done when |
| --- | --- | --- |
| 0.1 License plumbing | GPL-3.0 declared in `package.json`, README, landing page; stale `optics-sketch` references fixed; `AGENTS.md` states the real compatibility policy | GitHub shows the license, every LLM-facing file points at `opticalsetup` |
| 0.2 CI | A workflow that runs `node --check`, `npm test` and `git diff --check` on every PR and on `main` | Luca makes it a required status check and enables admin enforcement |
| 0.3 Golden snapshots | `tools/update-golden.mjs` traces every bundled example and community scene and writes every readout to `test/golden/`; `test/golden.test.js` compares | Any physics change that alters a readout shows up as a reviewable diff |
| 0.4 Validation suite | `validation/` with pure-Python references and committed expected values; `test/validation.test.js` checks the JavaScript against them; `docs/validation.md` lists each model, its reference, tolerance and status | Every quantitative model shipped so far (Sellmeier, GDD, argon capillary, split-step NLSE, thick lens, polarization) has an independent check |
| 0.5 Adding-physics protocol | `docs/adding-physics.md`: reference first, then expected values, then the JavaScript, then tests, then the model statement, then the fidelity label | A new model cannot merge without a reference and a tolerance |

## Phase 1: fidelity as data

The README's simulation-scope essay exists because fidelity is encoded
nowhere machine-readable. This phase moves it into the engine.

| Step | Deliverable | Done when |
| --- | --- | --- |
| 1.1 Fidelity vocabulary | `sketch/js/fidelity.js`: `Fidelity` levels (`diagram`, `qualitative`, `estimate`, `computed`, `unavailable`) and structured caveat codes replacing the free-text strings (`LINEAR_ONLY`, `ARGON_OUT_OF_RANGE`, `phaseIssue`, `fieldIssue`, `dispersionModel`) | The strings exist in one place, with a code, a short reason and an optional element id |
| 1.2 Readouts carry fidelity | Every readout value the inspector, display and probes show is `{ value, unit, fidelity, caveats }`; start with the pulse stack (duration, GDD, spectrum, energy) and detector power | The inspector renders one uniform badge; tests assert fidelity transitions (a filtered pulse becomes `unavailable`) |
| 1.3 Model cards | Each element type gets a machine-readable `model` block: modelled effects, ignored effects, valid ranges, references, per-readout fidelity | The wiki's "In OpticalSetup" section is generated from it; `wiki.test.js` checks agreement instead of existence |
| 1.4 Validation page | A generated `validation/` page on the site listing every validated quantity with its reference and agreement | Researchers can read why a number is trustworthy without opening the repository |

## Phase 2: a pure, typed engine

| Step | Deliverable | Done when |
| --- | --- | --- |
| 2.1 Build step with type checking | Vite or esbuild, `tsconfig` with `allowJs` and `checkJs`; no file renames yet; still deploys as a static folder | The checker runs in CI; the service-worker precache list is generated |
| 2.2 Pure trace result | `traceScene()` returns one `TraceResult` holding everything now stashed in module-level maps; getters read from the last result | Export reuses the canvas result instead of re-tracing; two scenes can be traced in one process |
| 2.3 Worker | The engine runs in a Web Worker and posts immutable results; the editor never blocks on a trace | Animation frame rate is independent of trace cost; parameter sweeps become possible |
| 2.4 Engine package and CLI | `@opticalsetup/engine` importable from Node; `opticalsetup trace scene.json --readouts` | The golden and validation suites, the community validator and the LLM skill call the same entry point |

## Phase 3: one element, one module

| Step | Deliverable | Done when |
| --- | --- | --- |
| 3.1 Dispatch instead of switch | `interact()` dispatches to `elements/<type>/physics.js`; each `case` moves into its own file with a typed signature | `raytrace.js` no longer grows when an element is added |
| 3.2 Vertical slices | Each element folder owns schema, geometry, physics, readouts, model card and tests; drawing stays in the editor | Adding an element touches one engine folder and one editor folder |
| 3.3 Typed light state | One `derive(parent, delta)` replaces the hand-written child-inheritance block; the light record is a typed, read-only structure | Forgetting to propagate a field is a type error, not a silent physics bug |

These steps are mechanical and suited to parallel agent pull requests, one
element per PR, once 3.1 has landed.

## Phase 4: beam state on a path graph, and the estimates researchers ask for

| Step | Deliverable | Done when |
| --- | --- | --- |
| 4.1 Path graph | Pass one traces geometry and records the graph of ports and segments each source's light follows | The graph is inspectable ("laser L1 reaches PMT D2 through BS1 (T), M3, F2") |
| 4.2 Beam state per edge | Spectrum, spectral phase (GDD, TOD or a sampled phase), pulse train or field, absolute power in watts, polarization, Gaussian-beam q-parameter, coherence reference, caveats | Along-the-path physics runs once per branch, not once per sampling ray; the specimen probe pass, coherent replay and argon re-aggregation are deleted |
| 4.3 Estimators | Each a pure function on the beam state with a Python reference first: spot size and Rayleigh range, power budget from source to every detector, fluence and peak intensity, B-integral, undepleted SHG efficiency, third-order dispersion | Each lands as its own PR with validation entries |

## Phase 5: schema, content, community

| Step | Deliverable | Done when |
| --- | --- | --- |
| 5.1 Scene schema | JSON Schema generated from element schemas, published at a stable URL; the LLM skill validates against it | An agent builds a scene from the schema, not from 11k lines of source |
| 5.2 Content as Markdown | Wiki and example write-ups as Markdown with front matter, built at deploy time; generated HTML no longer committed | A wiki edit is a readable diff |
| 5.3 Versioned renderer | Share links pin the engine version that produced them (see PR #67) | A link opened later renders as it did when shared |

## Decisions Luca has to make

- GPL-3.0-only or GPL-3.0-or-later (0.1 assumes or-later; see that PR).
- Whether to make CI a required status check and enable admin enforcement (0.2).
- Whether fidelity badges appear on exported figures or only in the editor (1.2).
- Build tool and the moment to rename `.js` to `.ts` (2.1).
- Whether Codex session transcripts and the marketing playbook stay in this repository (5.2).

## Rules that apply from now on

- **No new quantitative model without a reference and a tolerance.** See
  `docs/adding-physics.md`.
- **No readout without a fidelity level** once 1.2 has landed.
- **Golden snapshots are updated deliberately.** A PR that changes them
  explains the physics reason in its description.
- **One PR, one step.** Every PR names the roadmap step it implements.
