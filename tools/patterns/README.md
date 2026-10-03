# Optical design patterns

`Patterns.md` owns the 162 pattern descriptions and relationships. The three
example modules audit their support in the current OpticalSetup registry.
`node tools/build-patterns.mjs` publishes static articles, function hubs and the
catalogue; run `node tools/build-sitemap.mjs` after changing routes.

## Actual setups only

Every record has `id`, `title`, `summary`, `limit`, and primary-source `references`
(`label`, `url`). Available examples use `mode: 'rays'`, a version 1 native
`scene` with real registry elements, and at least two meaningful `steps`.
Use deterministic IDs. Test that rays reach the intended elements/detectors and
that a relevant adjustment has the expected effect. A ray layout does not claim
wave, quantum, biological or other physics absent from the tracer.

If essential components cannot be represented, use `mode: 'unavailable'`, omit
`scene`, and provide a concrete `unavailableReason` naming what is missing.
The page publishes that explanation without a preview, download or canvas link.
Do not replace missing optics with text boxes, custom symbols or drawn paths.

`setupSVG` uses the application's own `buildSVG` exporter and ray tracer. The
preview, downloadable JSON and share link always represent the same scene.
No separate optical illustration is authored. Historical nodes/edges metadata
is ignored and can be removed; it is never published as a substitute setup.

## Site and discovery

Reuse `wiki/assets/wiki.css` for the established font, colors, header and buttons,
and the exact shared brand mark. Pattern CSS contains only page layouts.
Articles have descriptive canonical URLs, static copy, component/wiki links,
related pattern links, Article and Breadcrumb structured data, and social tags.
Function hubs provide crawlable topic navigation. Old ID routes redirect to the
canonical article. Interactive catalogue filters use a URL fragment so they do
not create a crawlable combination of faceted URLs.

Run `npm test`, JavaScript syntax checks and `git diff --check`. Check the real
canvas and the catalogue at desktop, 1024px and mobile widths. No scene format
change, runtime dependency, custom physics or app build step is introduced.
