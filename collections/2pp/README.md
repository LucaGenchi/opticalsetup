# Two-photon lithography research workspace

References, figure reviews and optical reasoning for the throughput-scaling
benchmark. The rejected generated setups were removed at the user's request.
Verified native reconstructions are now added one apparatus at a time, with a
paper-specific evidence note and explicit model limits.

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

## Working setups

- `setups/<paper-id>.json` contains a native OpticalSetup save file.
- `research/<paper-id>.md` records primary evidence, interpretations, controls
  and handoff limits.
- The collection builder validates each available scene and gives its paper
  page an editable native share link. Papers without a scene remain notes only.

## Previously removed material

The 15 generated apparatus drawings and the array demonstration scene are gone,
along with their scene manifest, native layout recipes, scene generators,
embedded previews, edit/download links, Examples entries, offline cache entries
and lab preset links. Rebuilding these pages cannot recreate a setup.

Reusable component code and its tests remain available for focused paper work.
The bounded cross-site import helpers remain infrastructure; only a paper with
a verified working setup receives a paper-basis handoff link.

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
