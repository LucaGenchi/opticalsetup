// Consolidated sitemap generator: `node tools/build-sitemap.mjs`.
//
// sitemap.xml lists the wiki, the community section, and Examples pages
// together. It used to be written piecemeal by tools/build-wiki.mjs alone
// (which meant community and Examples pages were never in it at all) —
// this script is the single place that owns sitemap.xml now, so no other
// generator's run order can silently clobber another's URLs. Run this
// after any of build-wiki.mjs, build-community.mjs, or
// build-examples-pages.mjs.

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { wikiEntries } from './wiki-content.mjs';
import { exampleEntries } from './examples-content.mjs';
import { examples } from '../sketch/js/examples-data.js';
import { community } from '../sketch/js/community-data.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = 'https://opticalsetup.com';

async function main() {
  const examplesByName = new Map(examples.map(e => [e.name, e]));
  const exampleSlugs = exampleEntries.map(entry => {
    const manifestEntry = examplesByName.get(entry.match);
    if (!manifestEntry) throw new Error(`examples-content.mjs references unknown example "${entry.match}"`);
    return manifestEntry.slug;
  });

  const urls = [
    { loc: `${SITE_URL}/`, priority: '1.0', freq: 'monthly' },
    { loc: `${SITE_URL}/sketch/`, priority: '0.9', freq: 'weekly' },
    { loc: `${SITE_URL}/wiki/`, priority: '0.8', freq: 'weekly' },
    ...wikiEntries.map(e => ({ loc: `${SITE_URL}/wiki/${e.type}/`, priority: '0.7', freq: 'monthly' })),
    { loc: `${SITE_URL}/example-setups/`, priority: '0.8', freq: 'weekly' },
    ...exampleSlugs.map(slug => ({ loc: `${SITE_URL}/example-setups/${slug}/`, priority: '0.7', freq: 'monthly' })),
    { loc: `${SITE_URL}/community/`, priority: '0.7', freq: 'weekly' },
    ...community.map(e => ({ loc: `${SITE_URL}/community/${e.slug}/`, priority: '0.6', freq: 'monthly' })),
  ];

  const today = new Date().toISOString().slice(0, 10);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${u.freq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`).join('\n') +
    `\n</urlset>\n`;
  await writeFile(join(ROOT, 'sitemap.xml'), xml, 'utf-8');
  console.log(`Wrote sitemap.xml: ${urls.length} URLs (${wikiEntries.length} wiki, ${exampleSlugs.length} example, ${community.length} community)`);
}

main().catch(err => { console.error(err); process.exitCode = 1; });
