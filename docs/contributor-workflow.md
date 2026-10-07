# Making changes to OpticalSetup

Use this guide to choose the files and checks for a repository change. For
constructing a scene without changing the app, use the
[scene-builder skill](../skills/opticalsetup/SKILL.md).

This guide adapts the supplied **OpticalSetup: how to make changes**
(`OpticalSetup-workflow.pdf`, 5 October 2026), checked against the repository
at `52a3984` (v1.0.0). Keep it aligned with the code as the project evolves.
The PDF is source material, not permission to perform its delivery steps.
[AGENTS.md](../AGENTS.md) remains the contributor policy; the specialist
guides linked below contain the detailed procedures.

## Start and finish every change

1. Read `README.md` and `AGENTS.md`; run `git status --short --branch`.
   Preserve existing edits and untracked files. If they overlap the task,
   use an isolated checkout instead of resetting or stashing another person's
   work.
2. Inspect the relevant implementation and tests with `rg` and `rg --files`.
   Identify the source files and generated outputs using the table below.
3. Work on `codex/<short-topic>`. For a clean checkout, fetch `origin` and
   create the branch from current `origin/main`. Preserve an existing task
   branch if the request is to continue its work.
4. Edit the sources, then run only the generators needed for that change.
   Read the whole generated diff; do not fix generated pages by hand.
5. Verify the affected behavior and complete the checks below. Report what
   changed, the physics limits, checks run, and any remaining failure.
6. Stop at the delivery requested by the user. A request to implement a
   change does not authorize pushing, opening a PR, posting a review request,
   merging, or cutting a release. For local-only work, hand off the files and
   branch name.

When delivery is requested, commit the focused source and generated changes.
Before committing or opening a PR, run the full verification in `AGENTS.md`.
`main` accepts PRs with `CI / test` green and the branch up to date. A comment
starting with `/andrea-review` requests Andrea's agent review; that review
informs the maintainer's merge decision and is not a required approval.

## Choose the sources and generators

All commands below run from the repository root. Release levels describe
these changes in isolation; other merged work can require a larger release.
Use `node tools/release.mjs status` to inspect the actual plan.

| Task | Edit these sources | Run these generators, in order | Expected release |
| --- | --- | --- | --- |
| Community setup | Review the submission and its recorded license; use the two workflow PRs | Normally automatic; manual fallback: `node tools/build-community.mjs`, then `node tools/build-sitemap.mjs` | Patch |
| Wiki text | `tools/wiki-content.mjs` | `node tools/build-wiki.mjs`, then `node tools/build-sitemap.mjs` | Patch if the app hash stays the same |
| Calculator page | `tools/calculators-content.mjs`, `calculators/<slug>/` | `node tools/build-calculators.mjs`, then `node tools/build-sitemap.mjs` | Patch; minor if app code or its inspector link changes |
| Bundled example | `Examples/<Category>/*.json`, `tools/examples-content.mjs` for an explanatory page | `node tools/build-examples.mjs`, `node tools/build-examples-pages.mjs`, then `node tools/build-sitemap.mjs` | Patch if app code stays the same |
| App element or behavior | Registry, tracer or dedicated model, controls as needed, tests, wiki content | `node tools/build-wiki.mjs`, then `node tools/build-sitemap.mjs`; example generators if adding a scene | At least minor |
| Quantitative model | Model statement, independent Python reference, app model, validation test mapping | `python3 validation/run.py`; affected page generators; `node tools/update-golden.mjs` only when reported scene values change | Minor when app behavior changes |
| Internal contributor docs | `AGENTS.md`, `docs/` outside `docs/physics/` | None | No public-site change under the current release scheme |

Generated outputs include `wiki/` and `sketch/js/wiki-types.js`,
`calculators/*/index.html` and its hub, `sketch/js/examples-data.js`,
`example-setups/`, `community/` and `sketch/js/community-data.js`, and
`sitemap.xml`. Include the relevant generated outputs with their source
change. New public directories require a new release hashing scheme; never
edit a scheme already used by a release (see the
[release policy](release-policy.md)).

## Community setup

Follow [community-setup-review.md](community-setup-review.md) for the
maintainer review process. Inspect the scene, description, source issue and
recorded license; do not infer a CC BY grant when it is absent.

The normal path is submission issue -> **Propose community setup** PR ->
maintainer approval by merge -> **Publish approved community setups** PR.
The publishing workflow generates the community pages, app manifest **and
sitemap**. Review those outputs instead of hand-editing them. Closing an
unmerged proposal rejects it without publishing anything.

Completion for repository work means the requested PR stage is reached and
verified. After release activation, merging the generated output makes the
setup eligible for a future release; it becomes visible only after that
release deploys. Several approved setups may go out together.

## Calculator

1. Decide whether this reuses an existing validated model or adds a new one.
   Any new or changed quantitative model follows
   [adding-physics.md](adding-physics.md): model statement -> independent
   reference from cited equations -> JavaScript -> validation mapping.
2. Add title, explanation, formulas and input schema to
   `tools/calculators-content.mjs`. Use `calculators/opa/` as a working
   example: `opa-calculator.js` is the DOM-free calculation module and
   `page.js` connects it to the page. Reuse app functions where available.
3. Build the calculator pages and sitemap with the commands in the table.
4. If requested, add `calculator: '<slug>'` to the element registry entry
   for the inspector link. Wiki entries have their own calculator link;
   update `tools/wiki-content.mjs` and rebuild the wiki when needed.
5. Check normal inputs and the stated domain boundaries; open the generated
   page locally and verify controls, results, and limitations.

Done means the page works, committed page output matches the generator, and
any quantitative claim has the independent checks required by the physics
protocol. Adding an app model or an inspector link changes app code and
requires at least a minor release.

## App element and wiki

1. Inspect the current registry and neighboring tests. Define label,
   category, parameter defaults and limits, drawing, optical surfaces, and
   capability: simulated, setup-dependent, or diagram-only. Most definitions
   live in `sketch/js/elements.js`; detectors and some specialized elements
   register through dedicated modules. Keep the registry authoritative.
2. Implement behavior in `sketch/js/raytrace.js` or a suitable dedicated
   module. Diagram-only elements must leave rays alone. Clamp numerical
   inputs at their schema boundary and keep non-finite values out of
   tracing, rendering, and export.
3. Add deterministic tests for every new surface kind or physics behavior:
   a normal case and a boundary or failure case. Follow
   [adding-physics.md](adding-physics.md) for quantitative changes.
4. Add new app modules to `PRECACHE_PATHS` in `sketch/service-worker.js`
   and bump its cache generation. Check the PWA tests.
5. Write the wiki entry in `tools/wiki-content.mjs`, including the actual
   model and its limits. Add a useful demo to `demoScenes` in
   `sketch/js/main.js` when needed. Build wiki and sitemap; include the
   generated `sketch/js/wiki-types.js`. Every visible element needs an
   article; `test/wiki.test.js` checks coverage.
6. Add a bundled example if it helps explain the behavior; follow the next
   section. If bundled scene readings move, regenerate golden snapshots and
   explain each changed result, rather than accepting the diff blindly.
7. Verify the app in a real browser at desktop width and near 1024 px,
   including the affected interaction, console errors, and overflow in the
   toolbar, palette, canvas, and inspector.

Done means the implemented capability, controls, demo and wiki agree. A
saved setup must keep opening: preserve existing conversions; use compatible
behavior, an explicit load conversion/version change, or a clear unsupported
message for a genuinely unreproducible scene. State the approach in the PR.
App release numbers and saved-scene format versions are separate.

## Bundled example

Follow [Examples/README.md](../Examples/README.md). Save a native scene to
`Examples/<Category>/<Name>.json`; folder and filename supply the dropdown
labels. Run `node tools/build-examples.mjs` to validate it against the real
registry and rebuild the index. Do not edit `examples-data.js` manually.

For an explanatory page, add its entry to `tools/examples-content.mjs`, then
build the example pages and sitemap. Open `/sketch/?example=<slug>` locally,
and its explanatory page if present. Confirm the intended paths and readings,
and disclose any inferred layout or diagrammatic substitution. A scene that
requires new app behavior also needs the element/physics workflow above.

## Verify and hand off

For code and generated-page work, install the locked dev dependencies with
`npm ci` if needed, so the KaTeX generator checks run rather than skip.
Before committing or opening a PR:

```bash
npm test
git diff --check
for file in sketch/js/*.js serve.mjs; do node --check "$file"; done
```

Also syntax-check any changed JavaScript outside those paths. CI checks all
tracked `.js` and `.mjs` files, and the full suite covers independent Python
references and generated-page freshness. Do not loosen physics tolerances
or replace snapshots solely to make a test pass.

For UI changes, run `node serve.mjs` and use `http://localhost:5182/sketch/`
or the relevant generated page. Local `/vX.Y/` paths serve the working tree
too; they are not evidence that a released copy behaves the same way.

In the handoff or requested PR description, name the user-visible result,
physics scope, compatibility approach when applicable, exact checks and
failures, and delivery state: local, committed, pushed, merged, released,
or live. Report skipped checks explicitly.

## Release is a separate maintainer task

Follow [release-policy.md](release-policy.md). After activation, ordinary
merges accumulate on `main`; they do not publish the site. Before activation,
Pages can still serve `main` directly. Check the activation/deployment state
when it matters; a local version label alone does not prove it is live.

`node tools/release.mjs status` is read-only. It compares the current tree
with the last release: content-only changes normally need a patch, app hash
changes need a minor, and a major is the maintainer's choice. Internal docs
alone are outside the current public-site hash and need no release.

Only cut a release when Luca asks. In that authorized task, fetch current
`origin/main`, choose `release/vX.Y.Z` from the status result, and follow the
policy's commands. `node tools/release.mjs prepare` writes only
`sketch/js/release.js` and `releases.json`; do not hand-edit them. Validate
with `node tools/release.mjs verify --tree` and the full checks before
committing those two files and performing the requested PR delivery.

If public files change after preparation, prepare again on current `main`
before release: the deploy rejects a tree that differs from its recorded
hash. Keep release tags and entries permanent. After the release PR merges,
verify successful deployment and read back About's version at both
`/sketch/` and `/vMAJOR.MINOR/sketch/`, including a pinned Share link, before
calling the result live. Older pinned links keep their original app and
cannot acquire elements introduced only in a newer copy.
