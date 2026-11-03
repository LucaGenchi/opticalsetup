// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
export const widgetResourceUri = 'ui://opticalsetup/workbench.html';
export const appIcons = [{ src: 'https://opticalsetup.com/sketch/icons/icon-192.png', mimeType: 'image/png', sizes: ['192x192'] }];

export async function buildWidget(origin) {
  const [html, css, widgetCSS] = await Promise.all([
    readFile(new URL('sketch/index.html', root), 'utf8'),
    readFile(new URL('sketch/css/style.css', root), 'utf8'),
    readFile(new URL('mcp/web/lab.css', root), 'utf8'),
  ]);
  const assets = origin + '/mcp/assets/';
  return html
    .replace(/<link[^>]+(?:manifest|icon|stylesheet)[^>]*>/g, '')
    .replace(/<script type="module"[^>]*><\/script>/g, '')
    .replace(/<meta[^>]+(?:og:|twitter:|theme-color)[^>]*>/g, '')
    .replaceAll('href="/', 'href="https://opticalsetup.com/')
    .replaceAll('href="./license.html"', 'href="https://opticalsetup.com/sketch/license.html"')
    .replace('</head>', () => `<meta name="robots" content="noindex,nofollow"><style>${css}\n${widgetCSS}</style></head>`)
    .replace('</body>', () => `<aside id="lab-sync" role="status" aria-live="polite"><span id="lab-status">Local setup · Save JSON for a backup</span><a id="official-editor" href="https://opticalsetup.com/sketch/" target="_blank" rel="noopener">Continue on opticalsetup.com ↗</a></aside><script type="module" src="${assets}mcp/web/entry.js"></script></body>`);
}

// Only public browser modules and optical datasets are served here.
export async function widgetAsset(path) {
  const file = path.slice('/mcp/assets/'.length);
  const types = { js: 'text/javascript', json: 'application/json', svg: 'image/svg+xml', png: 'image/png' };
  const allowed = /^(?:mcp\/web\/[a-z-]+\.js|sketch\/js\/[a-z0-9-]+\.js|sketch\/data\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.json|sketch\/icons\/[a-z0-9-]+\.(?:svg|png)|(?:Examples|community-submissions)\/(?:[^/%]+\/)*[^/%]+\.json)$/i;
  if (!allowed.test(file)) return new Response('Not found', { status: 404 });
  if (file.includes('\\') || file.split('/').some(part => part === '.' || part === '..')) return new Response('Not found', { status: 404 });
  const pathOnDisk = resolve(fileURLToPath(root), file);
  try {
    return new Response(await readFile(pathOnDisk), { headers: {
      'content-type': types[file.split('.').pop().toLowerCase()],
      'access-control-allow-origin': '*',
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-cache',
    } });
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'EISDIR') throw error;
    return new Response('Not found', { status: 404 });
  }
}
