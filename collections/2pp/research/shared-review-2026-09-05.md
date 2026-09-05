# Shared 2PP review — 2026-09-05

Scope: foundation PR108 and integration surfaces of the eleven open native
setup branches. Individual paper agents own scientific/scene corrections;
this record covers shared behavior and delivery compatibility.

## Corrected

- Zero or invalid configured average laser power previously emitted the same
  rays and resin write markers as a positive source. CW, pulsed and
  supercontinuum lasers now emit no illumination for zero, negative or invalid
  power. Missing legacy power retains qualitative tracing. Positive power
  continues to use normalized relative geometric ray weights; it is not a
  dose calibration.
- The setup branches contained independent `paper`, `setup` and `collection`
  loaders with incompatible editable/preview defaults. One helper accepts
  those aliases, validates IDs, requires explicit edit intent, and gives
  preview flags precedence. Native scenes fit the viewport in both modes;
  loading alone does not overwrite autosave.
- Competing builders and private scene allowlists prevented straightforward
  composition. The common builder validates each existing native scene and
  its evidence note, links all of them, and creates no scenes. The shared
  index is independent of the scene count on a particular feature branch.
- A numerical preset requires an explicitly reviewed per-paper subset;
  source defaults and full research settings cannot be silently promoted.

## Verification performed

- Full package test command's underlying `node --test`: **779 passed**.
  The `npm test` wrapper was cancelled by the runtime's network approval
  mechanism; the exact configured test command ran successfully directly.
- Deterministic regressions cover powerless/invalid/legacy sources, positive
  power boundaries, URL aliases, traversal and conflicting IDs, conflicting
  edit/preview flags, reviewed handoff subsets, two coexisting scenes,
  unknown scene IDs, missing notes and empty scenes.
- Existing array tests cover independent lenslet axes, chromatic metalens
  focal lengths, bounded normalization, energy partition across DOE orders
  and loss of evanescent orders.
- JavaScript syntax and whitespace checks passed. The common builder ran with
  zero authored scenes in the foundation and generated no scene files.
- The adoption helper was applied to disposable copies of all eleven original
  bootstrap variants; every resulting bootstrap passed syntax checks and had
  exactly one common loader with no stale private registry imports.
- Read-only `git merge-tree` and the live GitHub PR108 metadata both reported
  the foundation mergeable against its current main base during review.
- Browser inspection is coordinated by the parent review task; no additional
  browser checks are claimed by this foundation pass.

## Companion findings

The deployed/default companion parser ignores `basis`; its open PR7 accepts
only `basis=paper`, and rejects `basis=interpretation`. An interpretation
handoff therefore cannot currently preserve provenance reliably. Keep such
scene handoffs disabled until the destination supports them explicitly.

PR7's literature branch also returns before the existing source/specimen-plane
and polarization/default warnings. Those warnings should remain while the
traced-objective-NA statement is suppressed for literature-only imports.
This pass inspected the companion read-only and did not deploy it.

## Applying the common infrastructure

Follow `collections/2pp/README.md` and `tools/adopt-2pp-shared-loader.py`.
Preserve per-paper evidence, controls, records and native optical features.
Replace singleton publication assertions with assigned-scene inclusion and
canonical explicit editable/preview URL assertions. Rebuild after the edit.
No setup branches, PRs or deployments were merged by this review.
