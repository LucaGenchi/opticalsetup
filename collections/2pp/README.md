# Two-photon lithography paper collection

A new reconstruction from downloaded primary documents and inspected apparatus
figures, based on the references in Andrea Bertoncini's throughput-scaling article.
The earlier July reconstruction was not used as a source for the scenes.

## Coverage and research boundary

- 17 distinct references (16 papers and one commercial datasheet), corresponding
  to 18 benchmark points. Gu's two points use different metalens arrays.
- 12 full article PDFs, one datasheet, and five supplements were retrieved and
  parsed. Gu has an official supplement and public extended apparatus figures,
  but its main PDF remains unavailable.
- 15 editable apparatus drawings cover 14 references. Dong 2007, Yang 2015 and
  Yan 2015 have no scenes because their full text could not be obtained.
- The Dong benchmark DOI was corrected to `10.1063/1.2789661`. The original
  `10.1063/1.2535504` identifies a different paper.
- The downloaded GT datasheet is a 2016 revision, whereas the benchmark point
  is labelled 2014. Its internal optical prescription is not disclosed.

`papers.json` is the independent evidence record: exact identifiers, inspected
pages/figures, ordered optical functions, auxiliary paths, reported numerical
settings, conflicts and unresolved details. `sources.json` pins URLs, byte counts,
SHA-256 hashes and page counts. No paper PDFs or publisher figures are committed.

## What the drawings mean

These are native OpticalSetup files. Each component and each manual path can be
selected, edited, removed and saved. The public previews use the existing locked
example viewer; **Edit drawing** opens a self-contained share link in the full
workbench. The examples also appear under **2PP Paper Collection**.

The main optical sequence is unfolded for readability. Numbered auxiliary port
references avoid ambiguous line crossings. Distances and unspecified controls are
schematic; source emission is off. Dashed paths are authored annotations, never
simulated results. A source with incompletely reported settings is represented by
a labelled pass-through box instead of a pulse source with invented numbers.
Specialized relays with unknown prescriptions remain explicitly labelled
assemblies. These files are not optical design prescriptions or complete
simulations of the experiments.

The new diffractive beam splitter, microlens array and metalens array have separate
bounded 1D geometric models. **2PP Array optics models** demonstrates them with
actual traced rays. A microlens array focuses around separate lenslet axes; a DOE
splits angular orders; a metalens array also applies the existing inverse-
wavelength focal-length law. None computes CGHs, vectorial high-NA PSFs, temporal
focusing, stimulated depletion, acoustic wavefront compensation or curing.

## Two-Photon Lithography compatibility

Paper pages export a verified subset of the existing v1 query contract, labelled
`basis=paper`. Missing and out-of-range fields are listed before the link. They
are omitted, never clamped or replaced by inferred source defaults. Total source
power is not confused with per-focus or specimen-plane power. In particular,
kHz amplified lasers stay outside the lab's 10–100 MHz repetition range.

The companion destination change in `app/opticalsetup-handoff.js` recognizes
`basis=paper` and explains literature provenance without claiming a traced
objective. Deploy that change before presenting these new links on production.
No lab physics range was widened. Partial import is not experimental equivalence.

## Rebuild and verify

```sh
python3 tools/download-2pp-sources.py /path/to/local/research
node tools/build-2pp-collection.mjs
node tools/build-2pp-array-demo.mjs
node tools/build-examples.mjs
node tools/build-sitemap.mjs
node tools/check-2pp-handoff.mjs /path/to/twophotonlithography
npm test
for file in sketch/js/*.js serve.mjs; do node --check "$file"; done
git diff --check
```

`tools/2pp-apparatus.mjs` contains independently authored component sequences and
explicit auxiliary connections. Review the evidence before changing them. The
source downloader verifies complete PDF markers and the reviewed hash, and does
not overwrite existing files. A changed publisher file needs a new identity and
figure review, not an automatic hash update.
