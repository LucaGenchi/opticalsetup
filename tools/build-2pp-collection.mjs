// Render the preserved research workspace plus any individually reviewed
// native scenes. A paper appears here only when its own record names a setup;
// unfinished siblings remain research-only.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const DIR = fileURLToPath(new URL('../collections/2pp/', import.meta.url));
const records = JSON.parse(await readFile(join(DIR, 'papers.json'), 'utf8'));
const sources = JSON.parse(await readFile(join(DIR, 'sources.json'), 'utf8'));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const pretty = id => id.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
const link = p => p.doi.startsWith('arXiv:') ? `https://arxiv.org/abs/${p.doi.slice(6)}` : p.doi ? `https://doi.org/${p.doi}` : sources.documents.find(d => d.paper === p.id)?.url;
const list = items => items.map(s => `<li>${esc(s)}</li>`).join('');

const head = (title, canonical) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · OpticalSetup</title>
<meta name="description" content="Two-photon lithography research: primary references, inspected figures, optical sequences, reported parameters and unresolved details.">
<link rel="canonical" href="https://opticalsetup.com${canonical}"><link rel="stylesheet" href="/collections/2pp/style.css"></head>
<body><header><a class="brand" href="/">OpticalSetup</a><nav aria-label="Main"><a href="/sketch/">Workbench</a><a href="/example-setups/">Examples</a><a href="/collections/2pp/">2PP research</a></nav></header>`;
const end = `<footer>Research notes for future individual reconstructions. Source PDFs remain with their authors and publishers.<br>
<a href="/collections/2pp/sources.json">Download source manifest</a> · <a href="/collections/2pp/papers.json">Download research records</a></footer></body></html>\n`;
const setupPapers = records.papers.filter(p => p.reconstruction?.scene);
const evidenceStatus = p => p.reconstruction?.kind === 'mechanism-interpretation'
  ? 'Working mechanism interpretation'
  : p.reconstruction?.scene ? 'Working source-backed setup'
    : p.status === 'reviewed' ? 'Source notes available' : 'Full text needed';
const rows = records.papers.map(p => `<tr><td>${p.year}</td><th scope="row"><a href="${p.id}/">${esc(pretty(p.id))}</a><span>${esc(p.title)}</span></th><td>${esc(p.family)}</td><td>${evidenceStatus(p)}</td></tr>`).join('\n');
await writeFile(join(DIR, 'index.html'), head('2PP research workspace', '/collections/2pp/') + `<main>
<p class="eyebrow">Research workspace · ${records.reviewDate}</p><h1>Two-photon lithography,<br>paper by paper.</h1>
<p class="lead">Primary references, figure reviews and optical reasoning for reconstructing each apparatus individually.</p>
<div class="summary"><strong>17 references · ${setupPapers.length} individually reviewed working ${setupPapers.length === 1 ? 'scene' : 'scenes'}</strong><p>Fourteen references have usable primary documents. Gu is based on the official supplement and public apparatus figures. The GT datasheet is a 2016 revision of a benchmark labelled 2014. A working scene based on incomplete evidence is labelled as a mechanism interpretation rather than an apparatus reconstruction.</p></div>
<section aria-labelledby="papers"><h2 id="papers">References and understanding</h2><div class="table-wrap"><table><thead><tr><th>Year</th><th>Reference</th><th>Method</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table></div></section>
<section><h2>Starting point for individual setup work</h2><p>The previous batch-generated setups were removed. Each reference retains its reported optical sequence, inspected evidence, parameters and open questions. New scenes return one paper at a time after source review and explicit limitation checks.</p><p><a href="${esc(records.sourceArticle)}">Original throughput-scaling article</a></p></section></main>` + end);

for (const p of records.papers) {
  const docs = sources.documents.filter(d => d.paper === p.id);
  const settings = Object.entries(p.settings).map(([k,v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
  const reconstruction = p.reconstruction;
  const setup = reconstruction?.scene ? `<div class="summary"><strong>${reconstruction.kind === 'mechanism-interpretation' ? 'Working mechanism interpretation' : 'Working apparatus reconstruction'}</strong><p>${esc(reconstruction.summary)}</p></div>
<section><h2>Native working scene</h2><div class="preview"><iframe src="/sketch/?paper=${encodeURIComponent(p.id)}" title="${esc(pretty(p.id))} working optical setup"></iframe></div><p class="caption">The embed is the actual native scene in locked inspection mode. Rays and motion are computed by OpticalSetup; annotations do not affect propagation.</p>
<div class="actions"><a class="button" href="/sketch/?paper=${encodeURIComponent(p.id)}&amp;edit=1">Open editable setup</a><a class="button secondary" href="/collections/2pp/${esc(reconstruction.scene)}" download>Download native JSON</a>${reconstruction.note ? `<a class="download" href="/collections/2pp/${esc(reconstruction.note)}">Evidence and usage note</a>` : ''}</div></section>
<section><h2>Control experiments</h2><ol>${list(reconstruction.controls || [])}</ol></section>
<section><h2>Companion calculator</h2><p>${esc(reconstruction.companion)}</p></section>` : '';
  const html = head(pretty(p.id), `/collections/2pp/${p.id}/`) + `<main>
<a class="back" href="../">← All 17 references</a><p class="eyebrow">${esc(p.family)} · ${p.year}</p>
<h1 class="paper-title">${esc(p.title)}</h1><p><a href="${esc(link(p))}">${esc(p.doi || 'Vendor datasheet')}</a></p>
${setup || `<div class="summary"><strong>Research retained · setup removed</strong><p>${p.status === 'reviewed' ? 'The generated drawing has been removed. The source review below is preserved for a future individual reconstruction.' : 'Full text is still needed. The abstract and bibliographic record do not establish the complete apparatus.'}</p></div>`}
<section><h2>Current understanding</h2><p>${esc(p.mechanism)}</p>${p.opticalTrain.length ? `<h3>Reported optical sequence</h3><ol>${list(p.opticalTrain)}</ol>` : ''}${p.auxiliaryPath ? `<h3>Observation and auxiliary paths</h3><p>${esc(p.auxiliaryPath)}</p>` : ''}</section>
<section><h2>Evidence inspected</h2><ul>${list(p.reviewed) || '<li>Bibliographic identity and abstract only.</li>'}</ul><ul>${docs.map(d => `<li><a href="${esc(d.url)}">${esc(d.kind)} PDF</a> · ${d.pages} pages · SHA-256 <code>${d.sha256.slice(0,16)}…</code></li>`).join('')}${sources.additionalFigures.filter(f => f.paper === p.id).map(f => `<li><a href="${esc(f.url)}">${esc(f.label)}</a></li>`).join('')}</ul></section>
<section><h2>Limits and unresolved details</h2><p>${esc(p.modelLimits)}</p><ul>${list(p.unknowns)}</ul>${settings ? `<details><summary>Reported numerical inputs and units</summary><table><tbody>${settings}</tbody></table></details>` : ''}</section></main>` + end;
  await mkdir(join(DIR, p.id), { recursive:true });
  await writeFile(join(DIR, p.id, 'index.html'), html);
}
console.log(`Built ${records.papers.length} research pages with ${setupPapers.length} working ${setupPapers.length === 1 ? 'scene' : 'scenes'}`);
