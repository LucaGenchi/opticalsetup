// The Collections hub: one page listing every curated collection on the site.
// Each collection owns its own pages; this only names them and counts what
// they hold, so a stale figure cannot outlive the data it is drawn from.
// Run this after any collection's own builder, then build-sitemap.mjs.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { FAVICON, header } from './site-chrome.mjs';

const DIR = fileURLToPath(new URL('../collections/', import.meta.url));
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const { papers } = JSON.parse(await readFile(join(DIR, '2pp/papers.json'), 'utf8'));
const collections = [{
  slug: '2pp',
  title: 'Two-photon lithography',
  blurb: 'Primary references read one at a time: the optical train each paper reports, the evidence '
    + 'behind it, and native setups for the apparatus that could be reconstructed honestly.',
  detail: `${papers.length} references · ${papers.filter(p => p.status === 'reviewed').length} with source notes`,
}];

const DESCRIPTION = 'Curated OpticalSetup collections: subject-by-subject research workspaces with primary '
  + 'references, evidence notes and native optical setups.';

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Collections — OpticalSetup</title>
<meta name="description" content="${DESCRIPTION}">
<link rel="canonical" href="https://opticalsetup.com/collections/">
<meta property="og:type" content="website">
<meta property="og:title" content="Collections — OpticalSetup">
<meta property="og:description" content="${DESCRIPTION}">
<meta property="og:url" content="https://opticalsetup.com/collections/">
<meta property="og:image" content="https://opticalsetup.com/assets/og-image.jpg">
<link rel="icon" href="${FAVICON}">
<link rel="stylesheet" href="../wiki/assets/wiki.css">
<link rel="stylesheet" href="../collections/assets/collections.css">
</head>
<body>
${header('..')}
  <div class="wiki-shell" style="grid-template-columns: 1fr;">
    <div>
      <div class="hub-hero">
        <h1>Collections</h1>
        <p>A collection takes one subject and follows its literature: what each paper actually reports, and the optical setups that can be traced from it.</p>
      </div>
      <div class="hub-groups">
        <div class="hub-group">
          <h2>Research workspaces</h2>
          <div class="hub-grid collection-grid">
${collections.map(c => `            <a class="hub-card" href="../collections/${esc(c.slug)}/">
              <span class="info">
                <span class="name">${esc(c.title)}</span>
                <span class="desc">${esc(c.blurb)}</span>
                <span class="desc count">${esc(c.detail)}</span>
              </span>
            </a>`).join('\n')}
          </div>
        </div>
      </div>
    </div>
  </div>
  <footer class="wiki-footer">Curated research and qualitative optical models. Source PDFs remain with their authors and publishers.</footer>
</body>
</html>
`;
await writeFile(join(DIR, 'index.html'), html);
console.log(`Built the collections hub with ${collections.length} collection${collections.length === 1 ? '' : 's'}`);
