// Build source pages and link individually authored native scenes. No scenes
// are generated, and one paper does not need a private loader or allowlist.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readCollectionSetups, reviewedPaperHandoff } from './2pp-collection-support.mjs';
import { FAVICON, header } from './site-chrome.mjs';

const DIR = fileURLToPath(new URL('../collections/2pp/', import.meta.url));
const records = JSON.parse(await readFile(join(DIR, 'papers.json'), 'utf8'));
const sources = JSON.parse(await readFile(join(DIR, 'sources.json'), 'utf8'));
const scenes = [...(records.introduction ? [records.introduction] : []), ...records.papers];
const setups = await readCollectionSetups(DIR, scenes);
if (records.introduction && (records.introduction.id !== 'basic-2pp'
  || records.papers.length !== 5 || setups.size !== 6)) {
  throw new Error('The curated 2PP collection requires Basic 2PP and exactly five authored paper scenes');
}
let archive = { papers: [] };
try { archive = JSON.parse(await readFile(join(DIR, 'research/archive.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const pretty = id => id.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
const link = p => p.doi?.startsWith('arXiv:') ? `https://arxiv.org/abs/${p.doi.slice(6)}` : p.doi ? `https://doi.org/${p.doi}` : sources.documents.find(d => d.paper === p.id)?.url;
const list = items => items.map(s => `<li>${esc(s)}</li>`).join('');
// Collections sit in the same shell as the wiki and examples: one header, one
// palette, one name for the canvas button. `base` is the relative path back to
// the site root, so every page's links resolve from wherever it sits.
const DESCRIPTION = 'Learn two-photon polymerization through one basic optical setup and five distinct research architectures, with editable native traces and source evidence.';
const head = (title, canonical, base) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} — OpticalSetup</title>
<meta name="description" content="${DESCRIPTION}">
<link rel="canonical" href="https://opticalsetup.com${canonical}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)} — OpticalSetup">
<meta property="og:description" content="${DESCRIPTION}">
<meta property="og:url" content="https://opticalsetup.com${canonical}">
<meta property="og:image" content="https://opticalsetup.com/assets/og-image.jpg">
<link rel="icon" href="${FAVICON}">
<link rel="stylesheet" href="${base}/wiki/assets/wiki.css">
<link rel="stylesheet" href="${base}/collections/assets/collections.css">
</head>
<body>
${header(base)}`;
const end = `
  <footer class="wiki-footer">Paper-specific research and qualitative optical models. Source PDFs remain with their authors and publishers. <a href="/collections/2pp/sources.json">Source manifest</a> · <a href="/collections/2pp/papers.json">Research records</a></footer>
</body>
</html>
`;
const cards = scenes.map((p, index) => `<a class="hub-card${p.id === records.introduction?.id ? ' collection-start' : ''}" href="${esc(p.id)}/"><span class="info"><span class="desc count">${index === 0 && records.introduction ? 'Start here' : esc(p.family)}</span><span class="name">${esc(p.shortTitle || pretty(p.id))}</span><span class="desc">${esc(p.summary || p.mechanism)}</span></span></a>`).join('\n');
await writeFile(join(DIR, 'index.html'), head('Two-photon polymerization', '/collections/2pp/', '../..') + `
  <div class="wiki-shell" style="grid-template-columns: 1fr;">
    <div>
      <div class="crumb"><a href="../../collections/">Collections</a> / Two-photon lithography</div>
      <div class="hub-hero">
        <h1>Two-photon polymerization</h1>
        <p>Start with serial writing, then explore five ways researchers control where many ultrashort pulses arrive.</p>
      </div>
      <p class="tagline">${scenes.length} editable setups · one educational introduction + ${records.papers.length} paper architectures · reviewed ${esc(records.reviewDate)}</p>
      <div class="hub-grid collection-grid">${cards}</div>
      <h2 class="section-head sim"><span class="sw"></span>What the traces show</h2>
      <p>Change a source, mask, scanner or relay to follow its effect on the light path. These are two-dimensional geometric models. A resin marker shows a qualitative pulsed arrival; its size does not predict a voxel, dose or curing.</p>
      <p>Each paper identifies reported values and design choices, with evidence and three control experiments. <a href="research/">Research-only archive and selection rationale</a> · <a href="${esc(records.sourceArticle)}">Original throughput-scaling article</a></p>
    </div>
  </div>` + end);

const PAPER_BASE = '../../..';
for (const paper of scenes) {
  const introductory = paper.id === records.introduction?.id;
  const docs = sources.documents.filter(document => document.paper === paper.id);
  const setup = setups.get(paper.id);
  const settings = Object.entries(paper.settings).map(([key,value]) => `<tr><th>${esc(key)}</th><td>${esc(value)}</td></tr>`).join('');
  const interpreted = !introductory && (paper.status !== 'reviewed' || /interpretation/i.test(paper.setup?.kind || ''));
  const setupBlock = setup ? `<div class="sim-block"><strong>${introductory ? 'Educational design · illustrative values' : interpreted ? 'Mechanism interpretation · apparatus evidence incomplete' : 'Native optical setup · qualitative model'}</strong>
      <p>${interpreted ? 'This scene is a labelled teaching interpretation, not a reconstruction of an established full optical train. ' : ''}Read the companion evidence note for reported facts, design choices, control experiments and model limits.</p></div>
      <div class="collection-actions"><a class="place-cta" href="${PAPER_BASE}/sketch/?paper=${esc(paper.id)}&amp;edit=1">Open editable setup</a><a class="plain" href="../${esc(setup.path)}" download>Download native scene</a><a class="plain" href="../${esc(setup.research)}">Evidence and controls</a></div>
      <div class="embed-wrap">
        <iframe class="embed-frame" src="${PAPER_BASE}/sketch/?paper=${esc(paper.id)}&amp;embed=1"
          title="${esc(pretty(paper.id))} — a live native trace of the setup described below"
          loading="lazy" tabindex="-1" aria-hidden="true"></iframe>
      </div>
      <p class="embed-caption">A live native trace, not a picture of one — this preview is not interactive. Open the editable setup to inspect components, change controls and save your own copy.</p>` : `<div class="sim-block"><strong>Research notes · native setup pending</strong>
      <p>${paper.status === 'reviewed' ? 'The source review below is preserved for an individual reconstruction.' : 'Full apparatus evidence is incomplete. Bibliographic records and abstracts do not establish the complete optical train.'}</p></div>`;
  const handoff = setup && !introductory ? reviewedPaperHandoff(paper) : null;
  const handoffBlock = setup && !introductory ? `
      <h2 class="section-head sim"><span class="sw"></span>Companion calculator</h2>
      ${handoff?.url ? `<p><a href="${esc(handoff.url)}">Open the explicitly reviewed paper subset</a></p><div class="handoff"><div><h3>Transferred</h3><ul>${handoff.imported.map(field => `<li>${esc(field.label)}: ${esc(field.value)} ${esc(field.unit)}</li>`).join('')}</ul></div><div><h3>Not transferred</h3><ul>${handoff.omitted.map(field => `<li>${esc(field.label)}: ${esc(field.reason)}</li>`).join('')}</ul></div></div>
      <p>Source ratings are not sample or per-focus power. The destination keeps defaults for missing quantities. Literature provenance requires the companion paper-handoff support; verify its import notice before using these values.</p>` : `<p>No calculator preset is supplied for this scene. <a href="../${esc(setup.research)}">See the evidence note</a> for supported inputs, omitted ranges and interpretation limits.</p>`}
      <p class="embed-caption">The workbench writing preview does not calibrate dose, curing or three-dimensional focal volume.</p>` : '';
  const html = head(paper.shortTitle || pretty(paper.id), `/collections/2pp/${paper.id}/`, PAPER_BASE) + `
  <div class="wiki-shell" style="grid-template-columns: 1fr;">
    <main class="wiki-article">
      <div class="crumb"><a href="${PAPER_BASE}/collections/">Collections</a> / <a href="${PAPER_BASE}/collections/2pp/">Two-photon lithography</a> / ${esc(pretty(paper.id))}</div>
      <div class="article-head"><div><h1>${esc(paper.title)}</h1></div></div>
      <p class="paper-meta">${introductory ? 'Paper-independent educational design · all values illustrative' : `${esc(paper.family)} · ${paper.year} · <a href="${esc(link(paper))}">${esc(paper.doi || 'Primary source')}</a>`}</p>
      ${setupBlock}
      ${paper.experiments?.length ? `<h2 class="section-head sim"><span class="sw"></span>Try three controls</h2><ol>${paper.experiments.map(item => `<li><strong>${esc(item.control)}.</strong> ${esc(item.result)}</li>`).join('')}</ol>` : ''}
      <h2 class="section-head real"><span class="sw"></span>Current understanding</h2>
      <p>${esc(paper.mechanism)}</p>${paper.opticalTrain.length ? `
      <h3>${introductory ? 'Optical sequence' : 'Reported optical sequence'}</h3><ol>${list(paper.opticalTrain)}</ol>` : ''}${paper.auxiliaryPath ? `
      <h3>Observation and auxiliary paths</h3><p>${esc(paper.auxiliaryPath)}</p>` : ''}
      <h2 class="section-head real"><span class="sw"></span>${introductory ? 'Design basis' : 'Evidence inspected'}</h2>
      <ul class="reference-list">${list(paper.reviewed) || '<li>Bibliographic identity and abstract only.</li>'}</ul>
      <ul class="resource-list">${docs.map(document => `<li><a href="${esc(document.url)}" target="_blank" rel="noopener">${esc(document.kind)} PDF</a> · ${document.pages} pages · SHA-256 <code>${document.sha256.slice(0,16)}…</code></li>`).join('')}${sources.additionalFigures.filter(figure => figure.paper === paper.id).map(figure => `<li><a href="${esc(figure.url)}" target="_blank" rel="noopener">${esc(figure.label)}</a></li>`).join('')}</ul>
      <h2 class="section-head sim"><span class="sw"></span>Limits and unresolved details</h2>
      <div class="limitations"><p>${esc(paper.modelLimits)}</p><ul>${list(paper.unknowns)}</ul></div>${settings ? `
      <div class="table-wrap"><table><thead><tr><th>Reported input</th><th>Value</th></tr></thead><tbody>${settings}</tbody></table></div>` : ''}${handoffBlock}
    </main>
  </div>` + end;
  await mkdir(join(DIR, paper.id), { recursive: true });
  await writeFile(join(DIR, paper.id, 'index.html'), html);
}
await mkdir(join(DIR, 'research'), { recursive: true });
await writeFile(join(DIR, 'research/index.html'), head('Research-only archive', '/collections/2pp/research/', PAPER_BASE) + `
<div class="wiki-shell" style="grid-template-columns:1fr"><main class="wiki-article">
<div class="crumb"><a href="../">Two-photon polymerization</a> / Research-only archive</div>
<h1>Research-only archive</h1><p>These references have no native setup in the curated collection. Their evidence remains useful; inclusion here is not a promise of a future scene.</p>
<p><a href="selection.md">Why five papers were selected</a> · <a href="review-protocol.md">Review criteria</a> · <a href="shared-review.md">Shared model review</a></p>
<div class="table-wrap"><table><thead><tr><th>Reference</th><th>Reason excluded</th><th>Evidence</th></tr></thead><tbody>${archive.papers.map(p => `<tr><th>${esc(pretty(p.id))}<span>${esc(p.title)}</span></th><td>${esc(p.exclusionReason || p.modelLimits)}</td><td>${link(p) ? `<a href="${esc(link(p))}">Primary reference</a>` : 'Incomplete source access'}${p.researchNote ? ` · <a href="${esc(p.researchNote)}">Research note</a>` : ''}</td></tr>`).join('')}</tbody></table></div>
</main></div>` + end);
console.log(`Built ${scenes.length} collection pages; linked ${setups.size} authored native scenes; archived ${archive.papers.length} research records`);
