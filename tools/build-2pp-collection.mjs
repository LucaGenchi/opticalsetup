// Render the preserved research workspace and any individually reviewed native scenes.
import { access, readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildPaperHandoff } from '../sketch/js/two-photon-handoff.js';

const DIR = fileURLToPath(new URL('../collections/2pp/', import.meta.url));
const records = JSON.parse(await readFile(join(DIR, 'papers.json'), 'utf8'));
const sources = JSON.parse(await readFile(join(DIR, 'sources.json'), 'utf8'));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const pretty = id => id.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
const link = p => p.doi.startsWith('arXiv:') ? `https://arxiv.org/abs/${p.doi.slice(6)}` : p.doi ? `https://doi.org/${p.doi}` : sources.documents.find(d => d.paper === p.id)?.url;
const list = items => items.map(s => `<li>${esc(s)}</li>`).join('');
const setupIds = new Set();
for (const paper of records.papers) {
  try {
    await access(join(DIR, 'setups', `${paper.id}.json`));
    setupIds.add(paper.id);
  } catch (_) { /* This paper remains research-only. */ }
}

const head = (title, canonical) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · OpticalSetup</title>
<meta name="description" content="Two-photon lithography research: primary references, inspected figures, optical sequences, reported parameters and unresolved details.">
<link rel="canonical" href="https://opticalsetup.com${canonical}"><link rel="stylesheet" href="/collections/2pp/style.css"></head>
<body><header><a class="brand" href="/">OpticalSetup</a><nav aria-label="Main"><a href="/sketch/">Workbench</a><a href="/example-setups/">Examples</a><a href="/collections/2pp/">2PP research</a></nav></header>`;
const end = `<footer>Research notes for future individual reconstructions. Source PDFs remain with their authors and publishers.<br>
<a href="/collections/2pp/sources.json">Download source manifest</a> · <a href="/collections/2pp/papers.json">Download research records</a></footer></body></html>\n`;
const rows = records.papers.map(p => `<tr><td>${p.year}</td><th scope="row"><a href="${p.id}/">${esc(pretty(p.id))}</a><span>${esc(p.title)}</span></th><td>${esc(p.family)}</td><td>${setupIds.has(p.id) ? 'Working native setup' : p.status === 'reviewed' ? 'Source notes available' : 'Full text needed'}</td></tr>`).join('\n');
await writeFile(join(DIR, 'index.html'), head('2PP research workspace', '/collections/2pp/') + `<main>
<p class="eyebrow">Research workspace · ${records.reviewDate}</p><h1>Two-photon lithography,<br>paper by paper.</h1>
<p class="lead">Primary references, figure reviews and optical reasoning for reconstructing each apparatus individually.</p>
<div class="summary"><strong>17 references · ${setupIds.size} individually reviewed working setup${setupIds.size === 1 ? '' : 's'}</strong><p>Fourteen references have usable primary documents. Gu is based on the official supplement and public apparatus figures. The GT datasheet is a 2016 revision of a benchmark labelled 2014. Dong, Yang and Yan still need full text.</p></div>
<section aria-labelledby="papers"><h2 id="papers">References and understanding</h2><div class="table-wrap"><table><thead><tr><th>Year</th><th>Reference</th><th>Method</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table></div></section>
<section><h2>Starting point for individual setup work</h2><p>The previous generated setups have been removed. Each reference retains its reported optical sequence, inspected evidence, parameters and open questions. These notes are a starting point to check against the original figures and methods, not an accepted reconstruction.</p><p>Future work should focus on one apparatus at a time, resolving its optical paths and missing prescriptions before creating an editable scene.</p><p><a href="${esc(records.sourceArticle)}">Original throughput-scaling article</a></p></section></main>` + end);

for (const p of records.papers) {
  const docs = sources.documents.filter(d => d.paper === p.id);
  const hasSetup = setupIds.has(p.id);
  const handoff = hasSetup ? buildPaperHandoff(p.settings) : null;
  const handoffHTML = handoff?.url ? `<section><h2>Paper-supported calculator handoff</h2><p>This partial preset transfers only verified, in-range values. Unknown or non-unique values remain unset.</p><div class="actions"><a class="button secondary" href="${esc(handoff.url)}">Open Two-Photon Lab</a></div><div class="handoff"><div><h3>Transferred</h3><ul>${handoff.imported.map(f => `<li>${esc(f.label)}: ${esc(f.value)}${f.unit ? ` ${esc(f.unit)}` : ''}</li>`).join('')}</ul></div><div><h3>Left unset</h3><ul>${handoff.omitted.map(f => `<li>${esc(f.label)} — ${esc(f.reason)}</li>`).join('')}</ul></div></div></section>` : '';
  const setupHTML = hasSetup ? `<div class="summary"><strong>Working native setup</strong><p>The editable scene traces the reported two-colour sequence to the resin while labelling every inferred prescription and unsupported mechanism.</p></div>
<div class="actions"><a class="button" href="/sketch/?paper=${esc(p.id)}">Open editable setup</a><a class="button secondary" href="../setups/${esc(p.id)}.json" download>Download scene JSON</a><a class="download" href="../research/${esc(p.id)}.md">Evidence and controls</a></div>
<section><h2>Live native preview</h2><div class="preview"><iframe title="${esc(pretty(p.id))} native OpticalSetup preview" src="/sketch/?paper=${esc(p.id)}&amp;embed=1" loading="lazy"></iframe></div><p class="caption">Computed native rays and editable components. The preview is locked so it cannot replace the workbench autosave; use “Open editable setup” to experiment.</p></section>` : `<div class="summary"><strong>Research retained · setup removed</strong><p>${p.status === 'reviewed' ? 'The generated drawing has been removed. The source review below is preserved for a future individual reconstruction.' : 'Full text is still needed. The abstract and bibliographic record do not establish the complete apparatus.'}</p></div>`;
  const settings = Object.entries(p.settings).map(([k,v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
  const html = head(pretty(p.id), `/collections/2pp/${p.id}/`) + `<main>
<a class="back" href="../">← All 17 references</a><p class="eyebrow">${esc(p.family)} · ${p.year}</p>
<h1 class="paper-title">${esc(p.title)}</h1><p><a href="${esc(link(p))}">${esc(p.doi || 'Vendor datasheet')}</a></p>
${setupHTML}
<section><h2>Current understanding</h2><p>${esc(p.mechanism)}</p>${p.opticalTrain.length ? `<h3>Reported optical sequence</h3><ol>${list(p.opticalTrain)}</ol>` : ''}${p.auxiliaryPath ? `<h3>Observation and auxiliary paths</h3><p>${esc(p.auxiliaryPath)}</p>` : ''}</section>
<section><h2>Evidence inspected</h2><ul>${list(p.reviewed) || '<li>Bibliographic identity and abstract only.</li>'}</ul><ul>${docs.map(d => `<li><a href="${esc(d.url)}">${esc(d.kind)} PDF</a> · ${d.pages} pages · SHA-256 <code>${d.sha256.slice(0,16)}…</code></li>`).join('')}${sources.additionalFigures.filter(f => f.paper === p.id).map(f => `<li><a href="${esc(f.url)}">${esc(f.label)}</a></li>`).join('')}</ul></section>
<section><h2>Limits and unresolved details</h2><p>${esc(p.modelLimits)}</p><ul>${list(p.unknowns)}</ul>${settings ? `<details><summary>Reported numerical inputs and units</summary><table><tbody>${settings}</tbody></table></details>` : ''}</section>${handoffHTML}</main>` + end;
  await mkdir(join(DIR, p.id), { recursive:true });
  await writeFile(join(DIR, p.id, 'index.html'), html);
}
console.log(`Built ${records.papers.length} research pages with ${setupIds.size} working native setup${setupIds.size === 1 ? '' : 's'}`);
