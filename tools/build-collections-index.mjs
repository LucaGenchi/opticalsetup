// The Collections hub: one page listing every curated collection on the site.
// Each collection owns its own pages; this only names them and counts what
// they hold, so a stale figure cannot outlive the data it is drawn from.
// Run this after any collection's own builder, then build-sitemap.mjs.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const DIR = fileURLToPath(new URL('../collections/', import.meta.url));
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const { papers } = JSON.parse(await readFile(join(DIR, '2pp/papers.json'), 'utf8'));
const collections = [{
  slug: '2pp',
  title: 'Two-photon lithography',
  eyebrow: 'Research workspace',
  blurb: 'Primary references read one at a time: reported optical trains, the evidence behind each '
    + 'claim, the values that are genuinely unresolved, and native setups for the apparatus that '
    + 'could be reconstructed honestly.',
  detail: `${papers.length} references · ${papers.filter(p => p.status === 'reviewed').length} with source notes`,
}];

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Collections · OpticalSetup</title>
<meta name="description" content="Curated OpticalSetup collections: subject-by-subject research workspaces with primary references, evidence notes and native optical setups.">
<link rel="canonical" href="https://opticalsetup.com/collections/"><link rel="stylesheet" href="/collections/style.css"></head>
<body><header><a class="brand" href="/">OpticalSetup</a><nav aria-label="Main"><a href="/sketch/">Workbench</a><a href="/example-setups/">Examples</a><a href="/collections/">Collections</a></nav></header><main>
<p class="eyebrow">Collections</p><h1>Subjects worked through,<br>reference by reference.</h1>
<p class="lead">A collection takes one subject and follows its literature: what each paper actually reports, what it leaves unsaid, and the optical setups that can be traced from it.</p>
${collections.map(c => `<div class="summary"><strong>${esc(c.eyebrow)} · ${esc(c.detail)}</strong><p>${esc(c.blurb)}</p></div>
<div class="actions"><a class="button" href="/collections/${esc(c.slug)}/">Open ${esc(c.title)}</a></div>`).join('\n')}
</main><footer>Curated research and qualitative optical models. Source PDFs remain with their authors and publishers.</footer></body></html>
`;
await writeFile(join(DIR, 'index.html'), html);
console.log(`Built the collections hub with ${collections.length} collection${collections.length === 1 ? '' : 's'}`);
