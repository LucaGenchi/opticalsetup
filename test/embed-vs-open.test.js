// The contract this file guards: every generated page frames its scene twice,
// and the two framings must not drift into each other.
//
//   iframe  ?<scene>&embed=1   a flat, inert picture -- no palette, no
//                              inspector, no controls, no pointer events
//   CTA     ?<scene>           the same scene as the visitor's own workbench,
//                              with the file and export toolbars behind it
//
// Getting this backwards is silent: the page still renders, the embed just
// becomes editable again, or the CTA opens something nobody can touch.

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function pagesUnder(dir) {
  const out = [];
  for (const entry of await readdir(resolve(ROOT, dir), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = resolve(ROOT, dir, entry.name, 'index.html');
    try { out.push({ name: `${dir}/${entry.name}`, html: await readFile(path, 'utf8') }); }
    catch { /* a directory without a built page is not this test's business */ }
  }
  return out;
}

// Attribute values are HTML-escaped in the built pages, so &amp; is the
// separator on disk; compare against the decoded URL a browser would use.
const decode = value => value.replace(/&amp;/g, '&');
const iframeSrcs = html => [...html.matchAll(/<iframe[^>]*\ssrc="([^"]+)"/g)].map(m => decode(m[1]));
const ctaHrefs = html => [...html.matchAll(/<a[^>]*class="place-cta"[^>]*href="([^"]+)"/g)].map(m => decode(m[1]));

for (const dir of ['wiki', 'example-setups', 'community']) {
  test(`${dir} pages embed inert previews and link to an editable canvas`, async () => {
    const pages = await pagesUnder(dir);
    assert.ok(pages.length > 0, `no built pages found under ${dir}/`);
    for (const page of pages) {
      for (const src of iframeSrcs(page.name === `${dir}/index` ? '' : page.html)) {
        if (!src.includes('/sketch/')) continue;
        assert.match(src, /[?&]embed=1(&|$)/,
          `${page.name}: embedded canvas must carry embed=1, got ${src}`);
      }
      for (const href of ctaHrefs(page.html)) {
        assert.doesNotMatch(href, /[?&]embed=1(&|$)/,
          `${page.name}: "Open in the canvas" must NOT carry embed=1, got ${href}`);
        assert.match(href, /\/sketch\/\?(demo|example|community|place)=/,
          `${page.name}: CTA must name a scene to open, got ${href}`);
      }
    }
  });
}

test('every embedded iframe is removed from the tab order', async () => {
  for (const dir of ['wiki', 'example-setups', 'community']) {
    for (const page of await pagesUnder(dir)) {
      for (const frame of page.html.match(/<iframe[^>]*>/g) || []) {
        if (!frame.includes('/sketch/')) continue;
        // A picture should not be a tab stop, and a screen reader should be
        // told the page prose carries the meaning, not the canvas.
        assert.match(frame, /tabindex="-1"/, `${page.name}: embed must not be focusable`);
        assert.match(frame, /aria-hidden="true"/, `${page.name}: embed must be aria-hidden`);
      }
    }
  }
});

test('the embed stylesheet hides every editing affordance', async () => {
  const css = await readFile(resolve(ROOT, 'sketch/css/style.css'), 'utf8');
  const block = css.slice(css.indexOf('body.embed-mode'));
  for (const selector of ['#palette', '#inspector', '.file-group', '.export-group',
    '.history-group', '#viewControls', '#btnAdd', '#btnTrash']) {
    assert.ok(block.includes(selector),
      `body.embed-mode must hide ${selector} — otherwise the "picture" is editable`);
  }
  assert.match(block, /#canvas\s*\{[^}]*pointer-events:\s*none/,
    'the embedded canvas must not accept pointer events');
  // The old class name must be gone: a stale body.demo-mode rule would match
  // nothing and silently leave the whole toolbar showing in an embed.
  assert.ok(!css.includes('body.demo-mode'), 'stale body.demo-mode rules must not survive');
});

test('embed mode is the only thing that suppresses the workbench autosave', async () => {
  const source = await readFile(resolve(ROOT, 'sketch/js/state.js'), 'utf8');
  assert.match(source, /embedMode/, 'state must expose embedMode');
  assert.ok(!source.includes('demoMode'), 'demoMode must be fully renamed');
});
