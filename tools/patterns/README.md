# Pattern examples

The catalogue metadata comes from `Patterns.md`. Authored example modules add
one concrete arrangement for every survey ID; `tools/build-patterns.mjs`
generates the public catalogue, article pages, previews, and saved scenes.

## Shared design

Visual thesis: a light optical field guide, with spacious typography, fine ruled
rows and large dark optical diagrams; wavelength colors belong to optical paths.
Content: searchable index, function/discipline/application/type filters, a diagram
for each example, chosen configuration, inspection steps, model scope, composition
links, and references. Interaction: immediate filtering with URL state, restrained
row and link transitions, and an on-demand embedded workbench with a full-canvas link.

## Authoring contract

Each module exports `examples`, an array with one record per assigned ID:

```js
{
  id: 'IMG-01',
  title: 'Equal-focal-length 4f relay',
  summary: 'One concrete configuration, with chosen values when meaningful.',
  steps: ['What to inspect or change.', 'What this arrangement demonstrates.'],
  limit: 'The specific model boundary for this example.',
  mode: 'schematic', // or 'rays' ONLY when a live scene is supplied and tested
  nodes: [
    { id: 'object', label: 'Object', x: 90, y: 180, note: 'Role in this example.' },
    { id: 'lens', type: 'lens', label: 'Relay lens', x: 270, y: 180,
      note: 'Role and chosen focal length.', params: { f: 100 }, rot: 0 },
  ],
  edges: [
    { from: 'object', to: 'lens', label: 'image path', kind: 'light',
      via: [] }, // optional via [[x,y],...]; kind light, signal, or reference
  ],
  references: [{ label: 'Specific primary source', url: 'https://...' }],
  // Optional real OpticalSetup scene for mode=rays. Use createElement and
  // deterministic IDs; supply {version:1,elements:[...],beams:[],...}.
  scene: undefined,
}
```

Use a 960 x 440 diagram plane (x 70..890, y 65..350). Keep labels short and
nodes separated (at least 135 horizontally and 100 vertically); wrap long labels
in the renderer. Use 4–8 nodes usually; meaningful branches, loops, parallel
channels, and focal planes take precedence over a linear block chain.
Every node needs an explanatory note. `type` is optional and must exist in the
live registry; labels describe roles, while component names come from the registry.
Schematic arrows express topology, never computed ray trajectories. Their saved
scenes use annotation-only elements so unsupported physics cannot appear traced.
Do not label a sketch quantitative merely because some individual components have
quantitative models. Save scene compatibility and conversion code stay unchanged.

Each author owns their module and targeted test. Do not edit shared generators,
page assets, or another author's files. Do not commit or push from subagents.
