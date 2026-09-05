# Two-photon lithography research workspace

References, figure reviews and optical reasoning for the throughput-scaling
benchmark. The earlier batch-generated setups were removed. Individually
reviewed native scenes now live under `setups/<paper-id>.json`, with a matching
evidence and control note under `research/<paper-id>.md`. The builder validates
and links existing scenes; it never reconstructs or generates an apparatus.

## Preserved material

- 17 references: 16 papers and one commercial datasheet, corresponding to 18
  benchmark points. Gu's two points use different metalens arrays.
- 12 complete article PDFs, one datasheet and five supplements were retrieved
  and parsed. Their local copies, extracted text and figure renders are retained.
- `papers.json`: identifiers, inspected pages/figures, reported optical sequences,
  mechanisms, auxiliary paths, numerical settings, conflicts and open questions.
- `sources.json`: source URLs, byte counts, SHA-256 hashes and page counts.
- Research pages for every reference, including explicit access gaps.

The notes remain working research to check against the PDFs. They are not an
accepted apparatus reconstruction. Some limitations describe the removed draft;
these are retained as useful cautions for future work.

Dong 2007, Yang 2015 and Yan 2015 still lack full text. Gu has an official
supplement and public apparatus figures, but no main article PDF. The GT
source is a 2016 datasheet revision for a benchmark labelled 2014. Dong's
correct DOI is `10.1063/1.2789661`; the benchmark DOI identifies another paper.

## Removed material

The 15 generated apparatus drawings and the array demonstration scene are gone,
along with their scene manifest, native layout recipes, scene generators,
embedded previews, edit/download links, Examples entries, offline cache entries
and lab preset links. Rebuilding pages cannot recreate any removed setup.
New individual contributions are discovered only when their authored scene
and nonempty evidence note are both present.

Reusable component code and its tests remain available for future work: the
three array elements, optional source emission and 3% AOM gating. The bounded
cross-site import helpers and companion PR are retained as infrastructure;
paper presets require an explicit reviewed subset as documented below.

## Continue one reference at a time

1. Read that reference's entry in `papers.json` and open its primary documents.
2. Inspect the cited figures, captions and methods directly. Recheck the notes.
3. Resolve the writing path and every observation, alignment and control branch.
4. Separate reported values from inferred layout and unknown prescriptions.
5. Only then reconstruct and validate that single setup, documenting remaining
   limits and any independently justified component changes.

## Rebuild research pages

```sh
python3 tools/download-2pp-sources.py /path/to/local/research
node tools/build-2pp-collection.mjs
node tools/build-examples.mjs
node tools/build-sitemap.mjs
npm test
for file in sketch/js/*.js serve.mjs; do node --check "$file"; done
git diff --check
```

The downloader checks complete PDF markers and the reviewed hash, and never
replaces existing files. Source PDFs and publisher figures remain local and
are not committed to the repository.


## Shared native loader and contribution contract

Use `/sketch/?paper=<paper-id>&edit=1` for the editable workbench and
`/sketch/?paper=<paper-id>&embed=1` for a locked preview. Bare collection URLs
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
