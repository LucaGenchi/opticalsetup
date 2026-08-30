// Static wiki generator: `node tools/build-wiki.mjs`.
//
// Reads content from wiki-content.mjs, pulls live icons/labels/descriptions
// straight from the component registry, pre-renders every formula to
// static HTML via KaTeX (server-side, no client-side KaTeX JS ships), and
// writes plain static pages under wiki/. Re-run this whenever wiki-content
// changes or the registry's labels/descriptions change — the output is
// committed like any other static asset; there is no request-time build
// step for the deployed site.

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import katex from 'katex';
import { registry, categories, createElement, getSize, getElementMeta } from '../sketch/js/elements.js';
// Some registry entries (etalon, vipa, and the detector-instruments variants)
// register themselves as a side effect of import rather than living in
// elements.js's static object literal — mirror main.js's imports so every
// registry type is present before validating/building wiki-content.mjs.
import '../sketch/js/etalon.js';
import '../sketch/js/vipa.js';
import '../sketch/js/detector-instruments.js';
import { wikiEntries, wikiToolSubjects } from './wiki-content.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = 'https://opticalsetup.com';

function renderFormula(tex) {
  return katex.renderToString(tex, { throwOnError: true, displayMode: true, output: 'htmlAndMathml' });
}

// Some wiki subjects are drawing tools rather than registry components — a
// fiber is a path in state.beams, not an element — so they supply their own
// icon and tagline instead of having them read off the registry.
const toolEntries = new Map(wikiToolSubjects.map(t => [t.type, t]));

function iconSVG(type) {
  const tool = toolEntries.get(type);
  if (tool) return `<svg viewBox="-24 -24 48 48" aria-hidden="true">${tool.icon}</svg>`;
  const def = registry[type];
  const el = createElement(type);
  const sz = getSize(el);
  const vb = Math.max(sz.w, sz.h) + 12;
  return `<svg viewBox="${-vb / 2} ${-vb / 2} ${vb} ${vb}" aria-hidden="true">${def.svg(el)}</svg>`;
}

function taglineOf(entry) {
  const tool = toolEntries.get(entry.type);
  if (tool) return tool.tagline;
  return getElementMeta(entry.type, createElement(entry.type).params).description;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const brandMark = () => `
  <svg class="brand-mark" viewBox="0 0 130 85" aria-hidden="true">
    <g class="mark-accent" stroke-width="4" stroke-linecap="round">
      <line x1="22" y1="45" x2="29" y2="45"/>
      <line x1="20.8" y1="47.8" x2="25.8" y2="52.8"/>
      <line x1="18" y1="49" x2="18" y2="56"/>
      <line x1="15.2" y1="47.8" x2="10.2" y2="52.8"/>
      <line x1="14" y1="45" x2="7" y2="45"/>
      <line x1="15.2" y1="42.2" x2="10.2" y2="37.2"/>
      <line x1="18" y1="41" x2="18" y2="34"/>
      <line x1="20.8" y1="42.2" x2="25.8" y2="37.2"/>
    </g>
    <line class="mark-accent" x1="29" y1="45" x2="77" y2="45" stroke-width="4" stroke-linecap="round"/>
    <polygon class="mark-ink" points="64,12 42,68 86,68" fill="none" stroke-width="4.5" stroke-linejoin="round"/>
    <g class="mark-accent" stroke-width="2.4" stroke-linecap="round">
      <line x1="77" y1="45" x2="108" y2="22"/>
      <line x1="77" y1="45" x2="108" y2="34"/>
      <line x1="77" y1="45" x2="108" y2="45"/>
      <line x1="77" y1="45" x2="108" y2="56"/>
      <line x1="77" y1="45" x2="108" y2="68"/>
    </g>
    <line class="mark-ink" x1="108" y1="14" x2="108" y2="76" stroke-width="4" stroke-linecap="round"/>
    <g class="mark-ink" stroke-width="3" stroke-linecap="round">
      <line x1="108" y1="22" x2="115" y2="22"/>
      <line x1="108" y1="34" x2="115" y2="34"/>
      <line x1="108" y1="45" x2="115" y2="45"/>
      <line x1="108" y1="56" x2="115" y2="56"/>
      <line x1="108" y1="68" x2="115" y2="68"/>
    </g>
  </svg>`;

function header(base) {
  return `
  <header class="site-header">
    <a class="brand" href="${base}/">${brandMark()}<span class="brand-ink">Optical</span><span class="brand-accent">Setup</span></a>
    <div class="header-actions">
      <a class="plain" href="${base}/wiki/">Wiki</a>
      <a class="plain" href="${base}/example-setups/">Examples</a>
      <a class="plain" href="${base}/community/">Community</a>
      <a class="btn" href="${base}/sketch/">Open the canvas</a>
    </div>
  </header>`;
}

function sidebar(entries, currentType, base) {
  const byCategory = new Map();
  for (const e of entries) {
    if (!byCategory.has(e.category)) byCategory.set(e.category, []);
    byCategory.get(e.category).push(e);
  }
  const cats = categories.filter(c => byCategory.has(c));
  return `
    <nav class="wiki-nav" aria-label="Component wiki index">
      <h2>Components</h2>
      ${cats.map(cat => `
        <div class="cat">
          <div class="cat-name">${esc(cat)}</div>
          <ul>
            ${byCategory.get(cat).map(e => `<li><a href="${base}/wiki/${e.type}/" class="${e.type === currentType ? 'current' : ''}">${esc(e.title)}</a></li>`).join('')}
          </ul>
        </div>`).join('')}
    </nav>`;
}

function referencesBlock(citations) {
  if (!citations || !citations.length) return '';
  return `
      <h2 class="section-head real"><span class="sw"></span>References</h2>
      <ol class="reference-list">
        ${citations.map((c, i) => `<li id="ref-${i + 1}"><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.label)}</a></li>`).join('')}
      </ol>`;
}

function formulaBlock(f) {
  return `<div class="formula">
      <div class="katex-render">${renderFormula(f.tex)}</div>
      ${f.caption ? `<div class="caption">${f.caption}</div>` : ''}
    </div>`;
}

// realWorld reads top to bottom as html -> formulas -> html2 -> formulas2 ->
// html3, so a formula can sit right in the paragraph that explains it rather
// than clustering every formula right after the opening paragraph regardless
// of which later section it belongs to. Most entries use only html/formulas;
// html2 is common for a second topic; html3/formulas2 exist for a rarer case
// -- a formula that belongs deeper in, next to its own paragraph, like the
// photodetector's frequency-response section. Filtering out unset parts
// (rather than always interpolating all five on their own template line)
// keeps every other entry's build free of dangling blank lines.
function realWorldHTML(rw) {
  return [
    rw.html,
    (rw.formulas || []).map(formulaBlock).join(''),
    rw.html2,
    (rw.formulas2 || []).map(formulaBlock).join(''),
    rw.html3,
  ].filter(Boolean).join('\n');
}

function pageHTML(entry, entries) {
  const base = '../..';
  const tagline = taglineOf(entry);
  const related = (entry.related || [])
    .filter(t => toolEntries.has(t) || (registry[t] && !registry[t].hidden));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(entry.title)} — Optics Encyclopedia | OpticalSetup</title>
<meta name="description" content="${esc(tagline)} Real-world physics and formulas, plus exactly how OpticalSetup models it.">
<link rel="canonical" href="${SITE_URL}/wiki/${entry.type}/">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(entry.title)} — OpticalSetup Encyclopedia">
<meta property="og:description" content="${esc(tagline)}">
<meta property="og:url" content="${SITE_URL}/wiki/${entry.type}/">
<meta property="og:image" content="${SITE_URL}/assets/og-image.jpg">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 130 85'%3E%3Cg stroke='%231361fa' stroke-width='6' stroke-linecap='round'%3E%3Cline x1='22' y1='45' x2='29' y2='45'/%3E%3Cline x1='18' y1='49' x2='18' y2='56'/%3E%3Cline x1='14' y1='45' x2='7' y2='45'/%3E%3Cline x1='18' y1='41' x2='18' y2='34'/%3E%3C/g%3E%3Cline x1='29' y1='45' x2='77' y2='45' stroke='%231361fa' stroke-width='6' stroke-linecap='round'/%3E%3Cpolygon points='64,12 42,68 86,68' fill='none' stroke='%230a1a33' stroke-width='7' stroke-linejoin='round'/%3E%3Cg stroke='%231361fa' stroke-width='4' stroke-linecap='round'%3E%3Cline x1='77' y1='45' x2='112' y2='28'/%3E%3Cline x1='77' y1='45' x2='112' y2='45'/%3E%3Cline x1='77' y1='45' x2='112' y2='62'/%3E%3C/g%3E%3C/svg%3E">
<link rel="stylesheet" href="${base}/wiki/assets/katex.min.css">
<link rel="stylesheet" href="${base}/wiki/assets/wiki.css">
</head>
<body>
${header(base)}
  <div class="wiki-shell">
    ${sidebar(entries, entry.type, base)}
    <main class="wiki-article">
      <div class="crumb"><a href="${base}/wiki/">Wiki</a> / <a href="${base}/wiki/#${entry.category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}">${esc(entry.category)}</a> / ${esc(entry.title)}</div>
      <div class="article-head">
        <div class="article-icon">${iconSVG(entry.type)}</div>
        <div>
          <h1>${esc(entry.title)}</h1>
        </div>
      </div>
      <p class="tagline">${esc(tagline)}</p>
      <a class="place-cta" href="${base}/sketch/?place=${entry.type}">Open in the canvas →</a>

      <div class="embed-wrap">
        <iframe class="embed-frame" src="${base}/sketch/?demo=${entry.type}"
          title="Interactive ${esc(entry.title)} — click it to see its live specs and try its parameters"
          loading="lazy"></iframe>
      </div>
      <p class="embed-caption">Click the ${esc(entry.title).toLowerCase()} to see its live specs and try its parameters — this mini canvas can't be moved, deleted, or added to.</p>

      <h2 class="section-head real"><span class="sw"></span>In the real world</h2>
      ${realWorldHTML(entry.realWorld)}

      <h2 class="section-head sim"><span class="sw"></span>In OpticalSetup</h2>
      <div class="sim-block">
        ${entry.inOpticalSetup.html}
        ${(entry.inOpticalSetup.formulas || []).map(formulaBlock).join('')}
        ${entry.inOpticalSetup.limitations ? `<div class="limitations"><span class="lbl">Simplified vs. reality</span>${entry.inOpticalSetup.limitations}</div>` : ''}
      </div>

      ${related.length ? `
      <h2 class="section-head real"><span class="sw"></span>Related components</h2>
      <div class="related-list">
        ${related.map(t => `<a href="${base}/wiki/${t}/">${iconSVG(t)}${esc(toolEntries.get(t)?.label ?? registry[t].label)}</a>`).join('')}
      </div>` : ''}

      ${referencesBlock(entry.citations)}

      ${(entry.resources || []).length ? `
      <h2 class="section-head real"><span class="sw"></span>Further reading</h2>
      <ul class="resource-list">
        ${entry.resources.map(r => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.label)}</a></li>`).join('')}
      </ul>` : ''}
    </main>
  </div>
  <footer class="wiki-footer">OpticalSetup is a qualitative geometric-optics workbench, not a calibrated design package — every "In OpticalSetup" section above says exactly where the model simplifies reality.</footer>
</body>
</html>
`;
}

function hubHTML(entries) {
  const base = '..';
  const byCategory = new Map();
  for (const e of entries) {
    if (!byCategory.has(e.category)) byCategory.set(e.category, []);
    byCategory.get(e.category).push(e);
  }
  const cats = categories.filter(c => byCategory.has(c));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Optics Encyclopedia — OpticalSetup</title>
<meta name="description" content="Real-world physics, formulas, and exactly how each optical component is modeled in OpticalSetup's live ray-tracing canvas.">
<link rel="canonical" href="${SITE_URL}/wiki/">
<meta property="og:type" content="website">
<meta property="og:title" content="Optics Encyclopedia — OpticalSetup">
<meta property="og:description" content="Real-world physics, formulas, and exactly how each optical component is modeled in OpticalSetup's live ray-tracing canvas.">
<meta property="og:url" content="${SITE_URL}/wiki/">
<meta property="og:image" content="${SITE_URL}/assets/og-image.jpg">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 130 85'%3E%3Cg stroke='%231361fa' stroke-width='6' stroke-linecap='round'%3E%3Cline x1='22' y1='45' x2='29' y2='45'/%3E%3Cline x1='18' y1='49' x2='18' y2='56'/%3E%3Cline x1='14' y1='45' x2='7' y2='45'/%3E%3Cline x1='18' y1='41' x2='18' y2='34'/%3E%3C/g%3E%3Cline x1='29' y1='45' x2='77' y2='45' stroke='%231361fa' stroke-width='6' stroke-linecap='round'/%3E%3Cpolygon points='64,12 42,68 86,68' fill='none' stroke='%230a1a33' stroke-width='7' stroke-linejoin='round'/%3E%3Cg stroke='%231361fa' stroke-width='4' stroke-linecap='round'%3E%3Cline x1='77' y1='45' x2='112' y2='28'/%3E%3Cline x1='77' y1='45' x2='112' y2='45'/%3E%3Cline x1='77' y1='45' x2='112' y2='62'/%3E%3C/g%3E%3C/svg%3E">
<link rel="stylesheet" href="${base}/wiki/assets/wiki.css">
</head>
<body>
${header(base)}
  <div class="wiki-shell" style="grid-template-columns: 1fr;">
    <div>
      <div class="hub-hero">
        <h1>The optics encyclopedia behind the canvas</h1>
        <p>Real-world physics and formulas for each component, paired with exactly how OpticalSetup models it — including where the simulation simplifies reality. Open any page straight into the live canvas.</p>
      </div>
      <div class="hub-groups">
        ${cats.map(cat => `
        <div class="hub-group" id="${cat.toLowerCase().replace(/[^a-z0-9]+/g, '-')}">
          <h2>${esc(cat)}</h2>
          <div class="hub-grid">
            ${byCategory.get(cat).map(e => {
    return `<a class="hub-card" href="${base}/wiki/${e.type}/">
                <span class="ic">${iconSVG(e.type)}</span>
                <span class="info"><span class="name">${esc(e.title)}</span><span class="desc">${esc(taglineOf(e))}</span></span>
              </a>`;
  }).join('')}
          </div>
        </div>`).join('')}
      </div>
    </div>
  </div>
  <footer class="wiki-footer">More components are added to the encyclopedia over time — <a href="${base}/sketch/">open the full component library in the canvas</a> to see everything available today.</footer>
</body>
</html>
`;
}

async function writeWikiTypesManifest() {
  const types = wikiEntries.map(e => e.type).sort();
  const path = join(ROOT, 'sketch', 'js', 'wiki-types.js');
  const js = `// Auto-generated by tools/build-wiki.mjs from wiki-content.mjs — do not edit by hand.\n` +
    `// Lists every component type that has a built page under wiki/, so the inspector\n` +
    `// can avoid linking to a page that doesn't exist yet.\n` +
    `export const WIKI_TYPES = new Set(${JSON.stringify(types)});\n`;
  await writeFile(path, js, 'utf-8');
}

async function main() {
  for (const entry of wikiEntries) {
    if (!registry[entry.type] && !toolEntries.has(entry.type)) {
      throw new Error(`wiki-content references unknown type "${entry.type}"`);
    }
  }
  const dir = join(ROOT, 'wiki');
  for (const entry of wikiEntries) {
    const pageDir = join(dir, entry.type);
    await mkdir(pageDir, { recursive: true });
    await writeFile(join(pageDir, 'index.html'), pageHTML(entry, wikiEntries), 'utf-8');
  }
  await writeFile(join(dir, 'index.html'), hubHTML(wikiEntries), 'utf-8');
  await writeWikiTypesManifest();
  console.log(`Built ${wikiEntries.length} wiki pages + index + wiki-types.js. Run tools/build-sitemap.mjs next to update sitemap.xml.`);
}

main().catch(err => { console.error(err); process.exitCode = 1; });
