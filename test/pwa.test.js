import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKETCH = resolve(ROOT, 'sketch');

async function pngDimensions(path) {
  const bytes = await readFile(path);
  assert.deepEqual([...bytes.subarray(1, 4)], [0x50, 0x4e, 0x47], `${path} is not a PNG`);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

test('PWA manifest describes an installable standalone workbench', async () => {
  const manifest = JSON.parse(await readFile(resolve(SKETCH, 'manifest.webmanifest'), 'utf8'));

  assert.equal(manifest.id, './');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
  assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);

  const expectedIcons = new Map([
    ['192x192', 'any'],
    ['512x512', 'any'],
  ]);
  for (const [size, purpose] of expectedIcons) {
    const icon = manifest.icons.find(candidate => (
      candidate.sizes === size && candidate.purpose === purpose
    ));
    assert.ok(icon, `missing ${size} ${purpose} icon`);
    assert.deepEqual(
      await pngDimensions(resolve(SKETCH, icon.src)),
      { width: Number(size.split('x')[0]), height: Number(size.split('x')[1]) },
    );
  }

  const maskable = manifest.icons.find(icon => icon.purpose === 'maskable');
  assert.ok(maskable, 'missing maskable icon');
  assert.deepEqual(
    await pngDimensions(resolve(SKETCH, maskable.src)),
    { width: 512, height: 512 },
  );
});

test('app shell registers the service worker and exposes install metadata', async () => {
  const html = await readFile(resolve(SKETCH, 'index.html'), 'utf8');

  assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon" href="icons\/apple-touch-icon\.png"/);
  assert.match(html, /name="theme-color"/);
  assert.match(html, /src="js\/pwa\.js"/);
});

test('offline cache covers every workbench module and bundled example', async () => {
  const source = await readFile(resolve(SKETCH, 'service-worker.js'), 'utf8');
  const match = source.match(/const PRECACHE_PATHS = (\[[\s\S]*?\]);/);
  assert.ok(match, 'service worker must declare PRECACHE_PATHS');
  const precache = new Set(JSON.parse(match[1]));

  for (const required of ['./', './index.html', './manifest.webmanifest', './css/style.css']) {
    assert.ok(precache.has(required), `offline cache is missing ${required}`);
  }

  const modules = (await readdir(resolve(SKETCH, 'js')))
    .filter(name => name.endsWith('.js'))
    .map(name => `./js/${name}`);
  for (const module of modules) {
    assert.ok(precache.has(module), `offline cache is missing ${module}`);
  }

  const examples = (await readdir(resolve(ROOT, 'Examples/Optics Bench')))
    .filter(name => name.endsWith('.json'))
    .map(name => `../Examples/Optics%20Bench/${encodeURIComponent(name)}`);
  for (const example of examples) {
    assert.ok(precache.has(example), `offline cache is missing ${example}`);
  }

  for (const path of precache) {
    if (path === './') continue;
    const decoded = decodeURIComponent(path);
    const details = await stat(resolve(SKETCH, decoded));
    assert.ok(details.isFile(), `${path} is not a file`);
  }
});
