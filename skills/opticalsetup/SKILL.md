---
name: opticalsetup
description: Build, validate, and encode OpticalSetup scenes from natural-language descriptions, then return working self-contained OpticalSetup share links. Use for optical bench diagrams, ray-tracing scenes, experiment layouts, and requests that should open directly in opticalsetup.com.
compatibility: Requires access to the public OpticalSetup repository or website. The bundled Node script is intended to run from a checkout of LucaGenchi/optics-sketch.
metadata:
  author: OpticalSetup
  version: "1.0"
---

# OpticalSetup scene builder

Create a valid OpticalSetup scene from the user's natural-language description and return a self-contained URL that opens the completed scene.

## Source of truth

Treat the current repository as authoritative. Do not rely on a remembered list of component types or parameters.

Read these files before constructing a nontrivial scene:

- Scene envelope, parsing, normalization, and serialization:
  https://github.com/LucaGenchi/optics-sketch/blob/main/sketch/js/state.js
- Main element registry, defaults, parameter specifications, drawing, and optical behavior:
  https://github.com/LucaGenchi/optics-sketch/blob/main/sketch/js/elements.js
- Detector definitions added to the registry:
  https://github.com/LucaGenchi/optics-sketch/blob/main/sketch/js/detector-instruments.js
- Share-link encoding and decoding:
  https://github.com/LucaGenchi/optics-sketch/blob/main/sketch/js/share.js
- Working scene examples:
  https://github.com/LucaGenchi/optics-sketch/tree/main/Examples

The application is a qualitative geometric-optics workbench, not a calibrated optical design package. Do not imply unsupported phase, coherent interference, diffraction-limited propagation, laboratory calibration, or manufacturing accuracy.

## Required workflow

1. Interpret the requested optical setup and identify each needed source, optic, detector, annotation, and manual beam or fiber.
2. Inspect the current registries and examples for the exact supported `type` names, parameter keys, defaults, ranges, and conventions.
3. Construct scene JSON using scene version 1.
4. Validate and normalize the scene with the current repository code.
5. Encode the validated JSON with the current share-link format.
6. Open or decode the resulting URL and confirm that it restores the intended scene.
7. Return the complete URL. Briefly disclose any important simulation limitation or diagrammatic substitution.

Never invent element types, parameter keys, or enum values. When the requested physics is unsupported, use supported diagram elements only when they still communicate the setup, and state the limitation.

## Scene format

Emit this top-level envelope:

```json
{
  "app": "optics2d",
  "version": 1,
  "elements": [],
  "beams": []
}
```

`elements` is required. Emit `beams` even when it is empty.

A normal element has this shape:

```json
{
  "id": "e-laser-1",
  "type": "cwlaser",
  "x": 100,
  "y": 200,
  "rot": 0,
  "label": "",
  "showLabel": false,
  "params": {}
}
```

Rules:

- Every element and beam ID must be a unique, nonempty string.
- `type` must exist in the current registry after `detector-instruments.js` has been imported.
- `x`, `y`, and `rot` must be finite numbers. Rotation is in degrees.
- Default optical propagation for registry elements is along local `+x`; position and rotate components accordingly.
- Use only parameter keys declared by the current component definition.
- Prefer explicit parameter values for behavior that matters to the request. The parser fills or normalizes omitted defaults.
- Optional label positions are `b`, `t`, `l`, or `r`.
- Use working examples to choose readable spacing and canvas-scale conventions.

See [examples/minimal-scene.json](examples/minimal-scene.json) for a smallest practical scene.

## Validation

From the repository root, the bundled script validates with the live registry, normalizes the scene, and prints the share URL:

```bash
node skills/opticalsetup/scripts/build-share-link.mjs path/to/scene.json
```

The validation path is equivalent to:

```js
import { parseSketch } from "./sketch/js/state.js";
import { registry } from "./sketch/js/elements.js";
import "./sketch/js/detector-instruments.js";

const normalized = parseSketch(sceneText, registry);
```

Validation should reject unknown element types and malformed coordinates, points, beams, or scene envelopes. Parameter values may be normalized or clamped by the current definitions, so inspect the normalized result when exact values matter.

## Share-link format

Use the current codec in `sketch/js/share.js`.

The URL base is:

```text
https://opticalsetup.com/v1/sketch/
```

The fragment is:

```text
#sketch=<encoding>.<base64url-data>
```

Current encodings:

- `g`: UTF-8 canonical JSON compressed as gzip, then Base64URL encoded.
- `j`: UTF-8 canonical JSON encoded directly as Base64URL.

Canonical JSON is `JSON.stringify(JSON.parse(sceneText))`. Use gzip only when it is smaller than the uncompressed UTF-8 bytes. Base64URL uses `-` and `_` and omits padding.

Current safety limits are 1,000,000 decoded scene bytes and 200,000 URL-fragment characters. Re-read `share.js` before encoding because this format may evolve.

Do not use the historical LZ-string scheme unless the current repository explicitly restores it.

## Output behavior

Return a complete clickable URL beginning with:

```text
https://opticalsetup.com/v1/sketch/#sketch=
```

Do not return a placeholder, truncated payload, or JSON-only answer when the user requested a working scene link. Keep the accompanying explanation brief and mention substitutions or unsupported physics that materially affect the scene.

## Compatibility

The current application release is `v1`, while the current scene format version is `1`. The application release in the pathname selects an immutable renderer; the scene version inside the payload selects the saved-data contract. Always re-read `release.js`, `state.js`, `elements.js`, `detector-instruments.js`, and `share.js` when generating against a newer repository revision.

The repository code and examples override this document if they disagree.
