# Shared native loader and contribution contract

Use `/sketch/?paper=<paper-id>&edit=1` for the editable workbench and
`/sketch/?paper=<paper-id>&embed=1` for an inert preview. Bare collection URLs
are previews so historical iframe links cannot replace the user's autosave.
The `setup` and `collection` aliases, `collectionMode=edit`, and `locked=1`
remain accepted. Invalid or conflicting IDs never become scene fetch paths.

The common builder discovers all authored JSON scenes, validates them through
the native registry and requires their companion notes. It preserves source
records and never generates a sibling scene. Do not add a private allowlist,
loader or builder for a single paper. The shared index does not encode the
number of scenes on a feature branch; each reference page owns its links.

A page-level numerical handoff is opt-in with this record structure:

```json
"handoff": {
  "basis": "paper",
  "verified": true,
  "settings": { "wavelengthNm": 780, "repetitionRateMHz": 80 }
}
```

Only use exact, directly checked values in that subset. Omit unknowns, upper
bounds, ambiguous measurement planes and unsupported rates. Neither the full
research `settings` object nor the scene's illustrative source parameters are
an automatic fallback. The companion's paper-provenance support is a separate
change; check its import notice before using a preset. Source power is not
sample or per-focus power.

For the existing independently authored setup branches, use
`tools/adopt-2pp-shared-loader.py --source <shared-checkout> --target <worktree>`
to review the planned edits, then repeat with `--write`. It preserves native
physics and scene files, replaces the competing collection bootstraps with
the shared implementation, and updates the PWA import. Rebuild pages and
inspect the diff before delivery. Setup tests must assert that their assigned
scene is available, not that no other scene can coexist.


The common collection loader follows the workbench's current `embedMode`
contract. Embedded previews are noninteractive. Editable links preserve the
visitor's previous workbench in undo, with the same replacement confirmation
as other linked scenes. Initial loading does not write autosave; after an
actual edit, the shared-link reload protection from the main application
remains in effect.
