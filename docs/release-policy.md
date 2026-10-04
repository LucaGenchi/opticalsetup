# Releases

OpticalSetup is developed on `main` and published by release. Merging a pull
request accepts the work; it does not put it on the site. The site changes
only when a release is cut.

## What a visitor sees

- `opticalsetup.com/sketch/` is always the latest release. So are the landing
  page, the wiki, the example pages, the calculators and the community
  section: the whole site is published together.
- Each released app also stays at `/vMAJOR.MINOR/sketch/` — `/v1.0/sketch/`,
  `/v1.1/sketch/`, and so on — for good.
- A link made with **Share** names that kept copy, for example
  `opticalsetup.com/v1.0/sketch/#sketch=…`. It keeps opening in the app that
  made it, so a later release does not redraw it or change its numbers. When a
  newer release exists, the kept copy says so and links to the current app.
- The current app keeps one autosave across releases. A kept copy has its own,
  so an older app never overwrites the bench saved by the current one.

A kept copy holds the app and the scene files it loads (`sketch/`,
`Examples/`, `community-submissions/`). Wiki, calculators and community pages
exist once, for the current release; links to them from a kept copy lead to
the current pages.

## Version numbers

A release is `vMAJOR.MINOR.PATCH`.

| Step | When | Kept copy |
| --- | --- | --- |
| **Patch** `v1.0.0 → v1.0.1` | Content only: a community setup, a wiki or example page, a calculator page, the landing page. | None. `/v1.0/sketch/` stays as it is. |
| **Minor** `v1.0.1 → v1.1.0` | The app changed: a fix, a new element, a change to tracing, drawing or export. | A new one, `/v1.1/sketch/`. |
| **Major** `v1.1.0 → v2.0.0` | The maintainer's call: a milestone, or a change to the saved scene format. | A new one, `/v2.0/sketch/`. |

"The app changed" is decided by a hash of `sketch/`, not by judgement. Four
files under `sketch/` are left out of it because they change with content and
not with how a scene is drawn: the release label, the generated lists of
examples and community setups, and the offline cache list. The tool will not
cut a patch release when that hash differs from the last release: doing so
would change what an already shared `/v1.0/` link opens.

This number is separate from the `version` inside a saved scene, which
describes the scene format (see "A saved setup must keep opening" in
`AGENTS.md`).

## Cutting a release

Releases are cut by hand, when there is enough to publish. Nothing is
scheduled.

```bash
node tools/release.mjs status      # what would be released, and as which version
git switch -c release/vX.Y.Z origin/main
node tools/release.mjs prepare     # or: prepare patch | minor | major
npm test
git add sketch/js/release.js releases.json
git commit -m "Release vX.Y.Z"
```

Open a pull request with that one commit. `prepare` writes the version into
`sketch/js/release.js` and appends an entry to `releases.json` recording the
date and the two hashes of exactly what is being released.

**Merging the release pull request is the release.** It starts the
`Deploy release` workflow, which:

1. checks that the merged commit is byte for byte what the entry recorded, so
   a release prepared before later changes landed cannot go out — prepare it
   again on the current `main`;
2. tags the commit `vX.Y.Z`;
3. builds the site from the release tags, never from the tip of `main`: the
   latest release at the root, and each kept app from the first tag of its
   `MAJOR.MINOR`, checked against its recorded hash;
4. checks that no staged page links to a file the site does not contain;
5. deploys it.

Running the workflow by hand redeploys the latest release. It never publishes
unreleased work.

Release tags and `releases.json` entries are permanent. To correct a release,
cut the next one. A tag that is moved or deleted stops the deploy with a
message naming it.

## Words

- **merged** — on `main`; not public.
- **released** — in `releases.json` and tagged.
- **live** — deployed, and read back from the public site.

Do not call merged work shipped or live.

## Checking unreleased work

Use the local server (`node serve.mjs`). It shows the working tree at
`/sketch/`, and answers `/vX.Y/…` paths with the same tree so that a pinned
link can be followed locally; that is not a copy of the release.

## Activation

Until the steps below are done, GitHub Pages still serves `main` directly and
every merge is public, as before. The release label is empty, **Share** makes
unpinned `/sketch/` links, and this policy is not in force.

1. In **Settings → Pages → Build and deployment**, set **Source** to
   **GitHub Actions**. The site keeps showing its last build until the first
   deploy.
2. Cut `v1.0.0` as above and merge the release pull request.
3. When `Deploy release` has finished, read back `opticalsetup.com/sketch/`
   (About shows the version) and `opticalsetup.com/v1.0/sketch/`.

Do the steps in this order. A release merged while Pages still serves `main`
would publish an app whose shared links point at a `/v1.0/` that does not
exist yet. Only the maintainer changes the Pages setting.
