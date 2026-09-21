# OpticalSetup roadmap: from sketch tool to trusted estimator

Status: proposed 2026-09-19, following the whole-project review in
[issue #170](https://github.com/LucaGenchi/opticalsetup/issues/170), revised
the same day after review (#172). Decisions are Luca's; this document records
the plan and its reasoning so that every pull request can point at the step it
implements.

## The goal in one sentence

Keep OpticalSetup the fastest way to draw an optical setup, and make every
number it reports something a researcher can trust, because each number says
how it was obtained, against what it was checked, and where the model stops.

## What "trusted" means here

Two properties of a reported number are kept apart, because an estimate can
be checked carefully and an exact formula can be checked not at all:

- **Approximation level**: how much of the physics the number contains —
  *diagram only*, *qualitative*, *estimate*, *computed*, or *unavailable*.
- **Evidence**: what the number has been checked against —
  *none*, *reference-checked*, or *experimentally validated*.

A quantity is **reference-checked** when all of the following hold. This
verifies that the code computes its stated model correctly at the tested
inputs; it does not by itself show that the model matches an experiment.
*Experimentally validated* is reserved for comparisons with measured data
that carry a stated uncertainty.

1. **Model statement.** The physics is written down: equations, assumptions,
   the parameter ranges inside which it applies, and a citation. Today this
   lives in the wiki and in README paragraphs; it should live next to the code.
2. **Independent reference.** The number is reproduced by something that does
   not share the app's reasoning: an analytic formula or limiting case, a
   published worked example, or an independently derived implementation under
   `validation/`. A second program written from the same idea can repeat the
   same conceptual error, so an independent derivation or an analytic limit
   counts for more than a second language.
3. **Recorded provenance.** Each reference records its source and version,
   the input domain it was tested over, its numerical convergence, and the
   absolute and relative tolerance with the reason for it. Unresolved
   uncertainty is written down, not dropped.
4. **Tests, including the edges.** The agreement is asserted with its
   tolerance, and the tests also cover invariants (energy, symmetry,
   partition independence) and the boundaries where the model must decline:
   mixed paths, insufficient sampling, inputs outside its range. They run in
   CI on every pull request.
5. **Labelled.** The app shows, next to the number, its approximation level
   and its evidence, and why it degrades when it does.
6. **Bounded.** Outside the stated ranges the app says "unavailable" with the
   reason, never a silently extrapolated value.

Everything below is ordered so that each step makes one more of these true
for one more part of the code, without breaking the live site.

## Phase 0: foundations

| Step | Deliverable | Done when |
| --- | --- | --- |
| 0.1 License plumbing | GPL-3.0 declared in `package.json`, README, landing page; stale `optics-sketch` references fixed; `AGENTS.md` states the real compatibility policy | GitHub shows the license, every LLM-facing file points at `opticalsetup` |
| 0.2 CI | A workflow that runs `node --check`, `npm test` and `git diff --check` on every PR and on `main` | Luca makes it a required status check and enables admin enforcement |
| 0.3 Golden snapshots | `tools/update-golden.mjs` traces every bundled example and community scene and records its drawables, drawn elements, pulse tracks, hits and readouts in `test/golden/`; `test/golden.test.js` compares | A physics change that alters a recorded readout shows up as a reviewable diff. Covering every readout the UI can show, including instrument-derived ones, is the acceptance target |
| 0.4 Reference checks and coverage inventory | `validation/` with independent references and committed expected values; `test/validation.test.js` checks the JavaScript against them; `docs/validation.md` lists every quantitative model the app ships as **covered** or **not yet covered**, with reference, tolerance and provenance for the covered ones | The inventory is complete, and a first set of models (Sellmeier, GDD, argon capillary, split-step NLSE, thick lens, polarization) is covered. The rest is listed, not claimed |
| 0.5 Adding-physics protocol | `docs/adding-physics.md`: model statement, reference first, then expected values, then the JavaScript, then tests (including edges), then the labels | A new model cannot merge without a reference and a tolerance |
| 0.6 Light-state inheritance rules | The rules for what a child ray inherits at an interaction — pulse record, spectrum and its slices, filtered pieces, caveats and provenance flags such as "reshaped" or "etalon comb" — written as one explicit table saying for each interaction kind and field whether it is inherited, transformed, reset or makes the readout decline, with tests over representative multi-step and recombination cases (filter → etalon, glass → filter → grating, splitter → recombination) | Losing a provenance flag at a second optic is caught by a test. The etalon-after-filter bug found in #169's review is the first case |
| 0.7 Browser behaviour tests | A small suite driving the real page: save and reload, undo and redo, an inspector edit, share link, SVG/PNG export | Refactors in later phases cannot silently break the editor |

Steps 0.6 and 0.7 come before any restructuring: the bugs recent reviews found
were state lost between interactions, which neither type checking nor unit
tests of single functions catch.

## Phase 1: fidelity as data

The README's simulation-scope essay exists because fidelity is not yet
represented uniformly per readout: the registry carries capability metadata,
but a number on screen does not say what it is. This phase moves it into the
engine.

| Step | Deliverable | Done when |
| --- | --- | --- |
| 1.1 Fidelity vocabulary | `sketch/js/fidelity.js`: approximation levels and evidence levels, and structured caveat codes replacing the free-text strings (`LINEAR_ONLY`, `ARGON_OUT_OF_RANGE`, `phaseIssue`, `fieldIssue`, the `DISPERSION_UNAVAILABLE` reasons). It builds on the capability metadata the element registry already carries (`readoutKind`, `source`, the simulated/setup/diagram badges) rather than starting over | The strings exist in one place, with a code, a short reason and an optional element id |
| 1.2 Readouts carry fidelity | Every readout value the inspector, display and probes show is `{ value, unit, approximation, evidence, caveats }`; start with the pulse stack (duration, GDD, spectrum, energy) and detector power | The inspector renders one uniform badge; tests assert the transitions — a filtered pulse whose phase and provenance are supported is an *estimate* with an effective quadratic phase, a filtered continuum an *estimate* with an assumed sweep, and unknown phase, an etalon's output or a band too broad for one quadratic phase make the **duration and envelope readouts** unavailable with their reason, leaving power, spectrum and the other quantities untouched |
| 1.3 Model cards | Each element type gets a machine-readable `model` block: modelled effects, ignored effects, valid ranges, references, per-readout fidelity | The wiki's "In OpticalSetup" section is generated from it; `wiki.test.js` checks agreement instead of existence |
| 1.4 Reference-check page | A generated page on the site listing every reference-checked quantity with its reference, tolerance and agreement, and the models not yet covered | Researchers can read why a number is trustworthy without opening the repository |
| 1.5 Units and schema contract | One stated convention for units and field names in scenes, readouts and the engine's inputs and outputs | Calculators, the scene schema (5.1) and exported readouts use the same names and units |

## Calculators

A **Calculators** section on the site gives experimentalists direct access to
the models the app uses, one small page per calculation, with no scene to
draw. Each calculator calls the same functions as the tracer — not a copy — so
a number checked in a calculator is the number the app computes, and each
shows the model statement, its range, its approximation level and its
evidence, with a link to the reference check where there is one. They are
also a way for users to check the app against their own hand calculations and
lab values.

First candidates, all already standalone functions in the engine:

- **Pulses:** transform limit from bandwidth and back (Gaussian and sech²);
  duration after a GDD; the GDD that stretches a pulse to a given duration;
  pulse energy and peak power from average power and repetition rate;
  autocorrelation deconvolution factors.
- **Materials:** Sellmeier index, group index, GVD and Abbe number of the
  catalogue glasses; GDD and group-delay spread of a glass thickness.
- **Fibers and capillaries:** fiber GDD from β₂ and length; argon capillary
  dispersion, nonlinearity and Marcatili loss.
- **Interferometry and spectroscopy:** etalon finesse, free spectral range,
  plate spacing and reflectivity; coherence length from linewidth and back.
- **Nonlinear:** OPO signal and idler wavelengths; sum- and difference-frequency
  wavelengths.
- **Imaging:** objective focal length, magnification, NA, acceptance angle and
  pupil diameter; thick-lens cardinal points.

Later, as estimators land (Phase 4): Gaussian-beam spot size and Rayleigh
range, fluence and peak intensity, B-integral, undepleted SHG efficiency.

**Release rule.** An existing engine calculation may ship as a calculator once
it has an inventory entry (0.4), a stated model and supported domain, explicit
units and conventions, visible approximation and evidence labels, and tests of
the page's input/output wiring and boundaries. Sharing the engine
implementation establishes consistency with the app, not independent
correctness, so the tests must check that the page supplies the tracer the
same effective inputs, not merely that it calls the same function. Invalid or
out-of-domain input produces a reason, never an old result or a silent
fallback; where a helper clamps internally, the page validates first or shows
the effective input it used. Assumptions and evidence travel with any copied
or downloaded result. A new quantitative model, or a change to an existing
model's physics, still needs the reference and tolerance of 0.5 — the
"not yet reference-checked" label is not a way in for new physics, and a
calculation known to be wrong is not exposed at all.

**Decided (Luca, 2026-09-21): the first calculators are reference-checked
ones only.** Unchecked existing calculations may follow later under the rule
above, labelled *not yet reference-checked*. The first release is two or
three small pages sharing one template — transform limit and GDD, material
dispersion, pulse energy and peak power — whichever of those already have
their reference checks when the work starts. The list above is a backlog, not
a commitment to ship it whole, and the calculator catalogue has one owner
before pages are written in parallel.

Each page states the assumptions that decide its answer: the pulse shape and
width convention; that a GDD inferred from a duration alone has no sign; the
material's wavelength range; that the etalon relation is the high-finesse
approximation; that an objective's rated NA is not the paraxial tracer's
convergence angle; and that an OPO wavelength calculator gives wavelength
relations only, not phase matching, threshold or efficiency.

Calculators need no restructuring of the engine, so this track can start once
the small agreed subset of 1.1 and 1.5 exists — names, units, approximation
and evidence vocabulary, valid domain and decline behaviour — and run
alongside Phases 1–3.

## Phase 2: a pure, checked engine

| Step | Deliverable | Done when |
| --- | --- | --- |
| 2.1 Type checking without a build step | The TypeScript checker run in CI over the existing `.js` files, reading JSDoc annotations (`checkJs`), introduced file by file. The site keeps deploying as the same static folder | The checker runs in CI on the files annotated so far |
| 2.2 Pure trace result | `traceScene()` returns one `TraceResult` holding everything now stashed in module-level maps; getters read from the last result | Export reuses the canvas result instead of re-tracing; two scenes can be traced in one process |
| 2.3 Command-line entry point | A small `tools/trace.mjs`: trace a scene file and print its readouts | The golden and reference suites, the community validator and the LLM skill call the same entry point |
| 2.4 Worker, if measurements justify it | The tracer runs in a Web Worker, with cancellation of stale traces and structured-cloneable results | Only if measured trace times make the editor stall; not before |

A bundler (Vite or esbuild) and renaming `.js` to `.ts` are not part of this
phase. A bundler brings deployment, offline-cache and debugging
responsibilities; it is adopted only for an identified need and with Luca's
explicit approval, as the repository guide requires. Publishing the engine as
an npm package is optional and not planned.

## Phase 3: one element, one module

| Step | Deliverable | Done when |
| --- | --- | --- |
| 3.1 Dispatch instead of switch | `interact()` dispatches to per-element physics modules; each `case` moves into its own file with a typed signature | `raytrace.js` no longer grows when an element is added |
| 3.2 Vertical slices | Each element folder owns schema, geometry, physics, readouts, model card and tests; drawing stays in the editor | Adding an element touches one engine folder and one editor folder |
| 3.3 Explicit light-state derivation | One `derive(parent, delta)` implements the inheritance table of 0.6; the light record is read-only | The table and its tests from 0.6 are the specification; types help but do not replace the tests |

Extraction PRs never change physical behaviour; a behaviour change is its own
PR. The contracts (fidelity vocabulary and readout envelope, `TraceResult`,
inheritance, dispatch) land one at a time. After that, extraction can run as
parallel PRs, one per **family of elements that share a surface handler,
spectrum state or coherent logic** — not one element per PR where several
element types share code. The golden snapshots (0.3) must not change.

## Phase 4: estimators researchers ask for

Each estimator is a pure function on explicitly defined trace data plus any
additional stated model inputs — a geometric ray trace alone does not fix a
Gaussian q-parameter, absolute watts, fluence, nonlinear overlap or
third-order dispersion. Each names its required inputs, normalization,
supported paths and refusal cases before it is written; missing beam, source
or material information is supplied explicitly or the estimator declines.
Each has a reference check first and lands as its own PR with an inventory
entry and a calculator:

- spot size and Rayleigh range (Gaussian-beam q-parameter along a path);
- power budget in watts from each source to every detector;
- fluence and peak intensity;
- B-integral;
- undepleted SHG efficiency;
- third-order dispersion.

**Not planned: a separate "path graph" engine.** Rebuilding the tracer as a
geometry pass followed by a per-branch beam-state pass would compute
along-the-path physics once per branch, and could replace the specimen probe
pass and coherent replay. But geometry and light state are coupled —
wavelength changes where rays go, clipping changes spectra, generated
wavelengths open new routes, cavities and coherent, mixing and OPO processes
couple paths — so a static geometry pass is not automatically sufficient, and
the rewrite would put every existing result at risk. It is revisited only if an
estimator above cannot be built on the existing trace, and then first as a
prototype compared against representative cavity, interference, mixing and
capillary scenes.

## Phase 5: schema, content, community

| Step | Deliverable | Done when |
| --- | --- | --- |
| 5.1 Scene schema | JSON Schema generated from element schemas using the contract of 1.5, published at a stable URL; the LLM skill validates against it | An agent builds a scene from the schema, not from 11k lines of source |
| 5.2 Content as Markdown | Wiki and example write-ups as Markdown with front matter, built at deploy time; generated HTML no longer committed | A wiki edit is a readable diff |
| 5.3 Reproducible share links | A share link records the engine version that produced it, and the site keeps that engine, its renderer and its assets loadable, with a stated storage policy (see PR #67) | A link opened later renders as it did when shared |

## Order and parallel work

1. Phase 0, including the coverage inventory (0.4), the inheritance rules
   (0.6) and browser behaviour tests (0.7).
2. Fidelity, units and schema contracts (1.1, 1.5) and the inheritance
   derivation they need; then readouts carry fidelity (1.2).
3. The pure trace result (2.2) and type checking (2.1).
4. Gradual extraction into modules (Phase 3).
5. A worker only if measured trace times justify it (2.4).

Alongside, once their inputs are stable: calculators, model cards, reference
checks for further models, estimators (Phase 4) and documentation.

Safe as parallel pull requests after Phase 0: reference checks for models that
do not share code; calculators for different functions; schema export against
an agreed contract (1.5); the browser test suite. Shared registries and
generators have one owner at a time, and PRs touching them merge and rebase
one after another.

## Decisions Luca has to make

- GPL-3.0-only or GPL-3.0-or-later (0.1 assumes or-later; see that PR).
- Whether to make CI a required status check and enable admin enforcement (0.2).
- Whether fidelity badges appear on exported figures or only in the editor (1.2).
- Which approximation levels mean what: "computed" says the model was
  evaluated exactly as stated, not that it matches an experiment.
- Whether and when a build tool is ever adopted (2.1 does without one).
- Whether Codex session transcripts and the marketing playbook stay in this repository (5.2).
- Which calculators come first, and where the section sits on the site.

## Rules that apply from now on

- **No new quantitative model without a reference and a tolerance**, following
  `docs/adding-physics.md` once step 0.5 has landed. Until then, the model
  statement, reference and tolerance go in the pull request description.
- **No readout without its labels** once 1.2 has landed.
- **Golden snapshots are updated deliberately.** A PR that changes them
  explains the physics reason in its description.
- **One PR, one step.** Every PR names the roadmap step it implements.
