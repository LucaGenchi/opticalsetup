# OpticalSetup release policy

OpticalSetup develops quickly but publishes deliberately. An ordinary merge is
accepted code; it is not automatically a public release.

## The two version numbers

- The application release is the integer pathname `v1`, `v2`, `v3`, and so on.
  It selects an immutable renderer and bundled content for durable share links.
- The scene format version is the numeric `version` inside saved JSON. It changes
  only when the data contract changes and is independent of the application
  release cadence.

Application releases use monotonically increasing integers, not semantic patch
numbers. One approved train or hotfix consumes one number. No version is created
for a week with no public product changes.

## Normal weekly train

The `Prepare weekly release` workflow runs every Monday at 09:17 in
`Europe/Rome`. The off-hour minute avoids GitHub Actions' busiest boundary. It:

1. verifies that every frozen release still matches its recorded content hash;
2. compares the current public product digest with the digest recorded by that
   release;
3. does nothing when they match;
4. otherwise bumps `APP_RELEASE`, creates the next append-only snapshot, runs the
   full checks, and opens a release PR.

The workflow never merges its PR. A maintainer reviews the accumulated behavior,
physics limitations, and visual result. Merging that release PR is the explicit
release authorization and triggers deployment.

## Fast development versus shipping

After the one-time Pages migration described below, `main` is the accepted-code
branch and may receive many focused merges per day. The public Pages artifact does
not change for those merges. `/sketch/` advances only when an approved release PR
is merged, so it always generates links for a renderer that exists at the matching
`/vN/sketch/` path.

Use these state names precisely:

- **local**: present only in a checkout;
- **merged**: present on `main`, but not necessarily public;
- **released**: frozen under a new `vN/` by an approved release PR;
- **deployed**: the release workflow completed successfully;
- **live**: the public domain was read back and the expected release verified.

Do not describe merged work as shipped, deployed, or live.

## Hotfixes

For an urgent production correction, manually run `Prepare weekly release`
instead of waiting for Monday. The hotfix still receives the next integer release
and still requires PR review. Never patch a published `vN/` directory in place.
If deployment validation fails, the previous Pages artifact remains the accepted
live release; repair forward and prepare another release candidate.

## Automated gates

Every frozen `vN/release.json` records:

- a hash of the immutable snapshot;
- a hash of the public source that produced it;
- the supported scene-format version;
- the directories bundled into the snapshot.

Deployment verifies every historical release and fails if a snapshot no longer
matches its manifest or if the current public source
does not exactly match the release being deployed. This also blocks a stale release
PR that was prepared before newer public changes landed on `main`.

The deployed Pages artifact contains only public static files plus every immutable
release. Tests, workflows, internal tools, and repository metadata are not hosted.

## One-time activation

As of 2026-08-22, the repository's Pages source is the legacy `main` branch root,
which publishes every merge. The weekly discipline is not active until a maintainer
changes **Settings → Pages → Build and deployment → Source** to **GitHub Actions**.

Make that settings change only after the release workflows and v1 are merged. Then
confirm under **Settings → Actions → General → Workflow permissions** that repository
policy permits the workflow's requested `contents: write` and `pull-requests: write`
permissions and allows GitHub Actions to create pull requests. The current token could
not read that administrative setting, so it must be checked by a maintainer.

After that, run `Deploy approved release` manually once and verify both:

- `https://opticalsetup.com/sketch/` shows the expected release badge;
- an existing `https://opticalsetup.com/v1/sketch/#sketch=…` link still opens.

Changing the Pages source, merging, pushing, or deploying requires explicit
maintainer authorization.
