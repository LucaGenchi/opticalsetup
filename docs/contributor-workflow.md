# Making changes to OpticalSetup

> **Merging to `main` publishes nothing.** opticalsetup.com changes only when
> a release is cut and deployed.

New contributors should start with [CONTRIBUTING.md](../CONTRIBUTING.md),
which sets out the project's purpose and accuracy bar. This page routes each
kind of change to its files, generators, checks and release level.
[AGENTS.md](../AGENTS.md) is the contributor policy, and the
guides linked below hold the details; where they say more, they win. To build
a scene without changing the app, use the
[scene-builder skill](../skills/opticalsetup/SKILL.md).

## The general workflow

1. **Start.** Follow AGENTS.md, *Start every task*: read, `git status`, work
   on `codex/<topic>`. If someone's uncommitted work overlaps yours, use a
   separate worktree; never reset or stash it.
2. **Change.** Edit the sources, then run the generators the table below
   names, in order. Commit generated output together with its source; never
   edit a generated file by hand.
3. **Check locally.** Run the commands in AGENTS.md, *Development commands*,
   after `npm ci` once, so the KaTeX page checks run instead of skipping.
   Also `node --check` any changed `.js` or `.mjs` file outside `sketch/js/`
   (CI checks every tracked one). For UI, open
   `http://localhost:5182/sketch/` from `node serve.mjs`. This is the only
   place unreleased work can be seen; local `/vX.Y/` paths serve the working
   tree, not the release.
4. **Pull request.** `main` takes it once `CI / test` is green and the
   branch is up to date. The description states the user-visible behaviour,
   the physics scope, the saved-scene compatibility approach when the format
   is touched, and the exact checks run.
5. **Review.** A comment line starting with `/andrea-review` asks Andrea's
   agent to review. It reviews and does not edit: the author makes the fixes
   and asks again. Its reply informs the merge; it does not block it.
6. **Merge.** Luca decides. The work is now *merged*, not *live*.
7. **Release**, only when Luca asks (see [Release](#release)). Call work
   *live* only after the deploy has been read back.

**Limits for agents.** Do only the delivery you were asked for: implementing
a change does not authorise pushing, opening a PR, requesting a review,
merging or releasing. Every handoff states how far the work got (local,
committed, pushed, merged, released or live) and names every skipped or
failing check. Never loosen a tolerance or regenerate snapshots just to make
a test pass.

## Quick reference

Run generators from the repository root as `node tools/<name>.mjs`. Release
levels are for the change on its own; `node tools/release.mjs status` gives
the real level for everything merged since the last release.

| Change | Edit | Then run, in order | Release | Easy to miss |
| --- | --- | --- | --- | --- |
| Community setup | Nothing by hand: two workflow PRs on github.com | Automatic (`tools/build-community.mjs`, `tools/build-sitemap.mjs`) | Patch | CC BY only if the author ticked it (the `license` field) |
| Wiki text | `tools/wiki-content.mjs` | `tools/build-wiki.mjs`, `tools/build-sitemap.mjs` | Patch | A type's first article changes `sketch/js/wiki-types.js`, which makes it a minor |
| Calculator page | `tools/calculators-content.mjs`, `calculators/<slug>/` | `tools/build-calculators.mjs`, `tools/build-sitemap.mjs` | Patch | Model first ([adding-physics](adding-physics.md)); any `sketch/` change, including the inspector link, makes it a minor |
| Bundled example | `Examples/<Category>/<Name>.json`; `tools/examples-content.mjs` for its explanatory page | `tools/build-examples.mjs`, `tools/build-examples-pages.mjs`, `tools/build-sitemap.mjs` | Patch | Commit `sketch/service-worker.js` too: the generator lists the example offline and bumps the cache generation |
| App element or behaviour | `sketch/js/`, tests, `tools/wiki-content.mjs` | `tools/build-wiki.mjs`, `tools/build-sitemap.mjs`; `tools/update-golden.mjs` if bundled readings move | Minor | A new `sketch/js/` file also goes in `PRECACHE_PATHS`; every visible element needs a wiki article |
| Quantitative model | Model statement, `validation/reference/<model>.py`, the app function, `test/validation.test.js` | `python3 validation/run.py`, then the generators of the affected element or calculator | Minor if app output changes | Register the reference in `MODULES` of `validation/run.py`; write it from the sources, never from the JavaScript |
| Citation (title, authors, DOI) | `CITATION.cff`, the *Cite this project* section of `index.html` (text and BibTeX), the DOI badge in `README.md` | None | Patch if `index.html` changes; otherwise none | All three must agree on author order, title and the concept DOI; Zenodo reads `CITATION.cff` when it archives a release |
| Landing page, `llms.txt`, scene-builder skill | `index.html`, `llms.txt`, `skill.md`, `skills/opticalsetup/` | None | Patch | Public, although they read like docs |
| Internal docs | `AGENTS.md`, `README.md`, `docs/` except `docs/physics/` | None | None | `docs/physics/` is published (the wiki links to it) |

## Step by step

### New or changed element

1. **Registry.** Add or change the entry in `sketch/js/elements.js`, or in
   the element's own module (for example `sketch/js/etalon.js`): label,
   category, defaults and limits, drawing, optical surfaces, and capability
   (simulated, setup-dependent or diagram-only). The registry is the only
   source of labels and defaults.
2. **Behaviour.** Implement it in `sketch/js/raytrace.js` or a dedicated
   module. Diagram-only elements leave rays alone. Clamp inputs at the
   schema boundary, and let nothing non-finite reach tracing, rendering or
   export.
3. **Tests.** Each new surface kind or physics behaviour gets a deterministic
   test with a normal case and a boundary or failure case. A reported number
   follows [adding-physics.md](adding-physics.md).
4. **Offline list.** Add a new `sketch/js/` file to `PRECACHE_PATHS` and bump
   the cache generation; `test/pwa.test.js` checks this.
5. **Wiki.** Write the article in `tools/wiki-content.mjs` (the model and its
   limits), and add a demo to `demoScenes` in `sketch/js/main.js` when it
   helps. Build the wiki, then the sitemap.
6. **Snapshots.** If any bundled scene's readings move, run
   `node tools/update-golden.mjs`, read the diff of `test/golden/`, and
   explain each change in the PR.
7. **Browser.** Check the interaction at desktop width and near 1024 px: no
   console errors, and no overflow in the toolbar, palette, canvas or
   inspector.
8. **Compatibility.** A scene saved today must keep opening; its results
   may change when the change fixes a bug or corrects the physics, and the
   PR says which. Keep every existing conversion. If a change cannot stay
   compatible, raise the scene `version` and convert on load, or show a
   clear "unsupported" message, and say which in the PR. The release is at
   least a minor, and older `/vX.Y/` links keep opening the older app,
   without the new element.

### Calculator

1. **Model first.** If it reports a number someone may act on, follow
   [adding-physics.md](adding-physics.md): model statement, then an
   independent Python reference, then the JavaScript, then the test mapping.
2. **Content.** Add the title, explanation, formulas and input schema to
   `tools/calculators-content.mjs`.
3. **Page module.** Add `calculators/<slug>/`, with a DOM-free calculation
   module that imports the app's functions, and the page script. The template
   is `calculators/opa/`: `calculators/opa/opa-calculator.js` and
   `calculators/opa/page.js`.
4. **Build.** Run the calculator build, then the sitemap. The suite fails if
   a committed page is stale.
5. **Links (optional).** `calculator: '<slug>'` on the element's registry
   entry adds an inspector link (app code, so a minor). The same field on the
   element's entry in `tools/wiki-content.mjs` links its wiki article to the
   calculator: rebuild the wiki, then the sitemap (a patch).
6. **Check.** Open the page locally: normal inputs, the domain boundaries,
   and the stated limits.

### Community setup

Everything happens on github.com; the full guide is
[community-setup-review.md](community-setup-review.md).

1. A user presses **Propose** in the app, or opens an issue.
2. A workflow opens **Propose community setup: &lt;name&gt;**, which adds
   `community-submissions/issue-<N>.json` and its golden snapshot. Review the
   scene, the description, the issue and the recorded licence. If no pull
   request appears, the workflow says why on the issue; re-run it from
   **Actions → Materialize example proposal → Run workflow** with the issue
   number.
3. Merging approves it; closing rejects it.
4. A second workflow opens **Publish approved community setups** with the
   generated page, `sketch/js/community-data.js` and `sitemap.xml`. Review it,
   don't edit it, and merge it.
5. The setup is now merged but not visible. It goes out with the next release
   (a patch); several setups can share one release.

## Release

Only when Luca asks. The policy is [release-policy.md](release-policy.md).

| Step | What it does |
| --- | --- |
| `node tools/release.mjs status` | Read-only: what changed since the last release, and which level |
| `git fetch origin`, then `git switch -c release/vX.Y.Z origin/main` | Starts the release from current `main` |
| `node tools/release.mjs prepare` (or `prepare patch`, `minor`, `major`) | Writes `sketch/js/release.js` and appends to `releases.json`; refuses a patch when the app changed |
| `node tools/release.mjs verify --tree`, then `npm test` | Confirms this tree is exactly the prepared release |
| Commit only those two files, open the PR, merge | The merge starts `Deploy release`, which tags `vX.Y.Z` and deploys the site |
| Read back | About shows the version at `/sketch/` and at `/vMAJOR.MINOR/sketch/`; a Share link opens the pinned copy |
| Luca publishes a GitHub Release for the tag `vX.Y.Z` | Zenodo archives it using metadata from `CITATION.cff` and assigns a version DOI. The deploy creates only the tag, so without this step the release has no Zenodo version |

- **Levels.** A patch is content only. A minor means the app changed, which
  is decided by a hash of `sketch/`, not by judgement. A major is Luca's
  call: a milestone, or a change to the saved-scene format. Release numbers
  are separate from a scene's `version`.
- **Merge nothing in between.** If public files change on `main` after
  `prepare`, the deploy refuses the release; prepare it again on current
  `main`.
- **Permanent.** Tags and `releases.json` entries are never edited or
  removed; a mistake is fixed by the next release. The hash schemes in
  `tools/release-lib.mjs` are never edited either: making a new directory
  public needs a new scheme.

**What a visitor sees.** `/sketch/` and the whole site (landing page, wiki,
examples, calculators, community) are the latest release. The first release
of each `MAJOR.MINOR` also stays at `/vMAJOR.MINOR/sketch/`, with its
`Examples/` and community scenes: after v1.0.1, the site is v1.0.1 but
`/v1.0/sketch/` is still v1.0.0 (a patch never changes the app). A Share link
names that kept copy, so a later release never redraws it; the kept copy says
when a newer release exists. A kept copy never gains later elements: a scene
that uses an element added in v1.1 opens correctly only from `/v1.1/sketch/`
onward.
