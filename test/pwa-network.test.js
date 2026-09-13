import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../sketch/service-worker.js', import.meta.url), 'utf8');

function worker({ fetch, open, match = async () => undefined }) {
  const events = {};
  vm.runInNewContext(source, {
    URL, Response, fetch, caches: { open, match },
    self: {
      location: { href: 'https://example.org/sketch/service-worker.js', origin: 'https://example.org' },
      addEventListener(name, fn) { events[name] = fn; },
    },
  });
  return request => {
    let response;
    events.fetch({ request, respondWith(value) { response = value; } });
    return response;
  };
}
const request = { url: 'https://example.org/sketch/js/main.js', method: 'GET', mode: 'cors' };
const networkResponse = () => ({ ok: true, type: 'basic', clone() { return { cachedCopy: true }; } });

test('a cache quota failure does not replace a successful fetch with stale content', async () => {
  const fresh = networkResponse(), stale = { old: true };
  const fetchRequest = worker({
    fetch: async () => fresh,
    open: async () => ({ put: async () => { throw Error('QuotaExceededError'); } }),
    match: async () => stale,
  });
  assert.equal(await fetchRequest(request), fresh);
});

test('a cache-open failure does not turn a successful fetch into a network error', async () => {
  const fresh = networkResponse();
  const fetchRequest = worker({
    fetch: async () => fresh,
    open: async () => { throw Error('Cache storage unavailable'); },
  });
  assert.equal(await fetchRequest(request), fresh);
});

test('successful online responses still update the offline cache', async () => {
  const fresh = networkResponse(); let cachedRequest, cachedResponse;
  const fetchRequest = worker({
    fetch: async () => fresh,
    open: async () => ({ put: async (req, response) => { cachedRequest = req; cachedResponse = response; } }),
  });
  assert.equal(await fetchRequest(request), fresh);
  assert.equal(cachedRequest, request);
  assert.deepEqual(cachedResponse, { cachedCopy: true });
});

test('a failed network request still uses the cached response', async () => {
  const cached = { offline: true };
  const fetchRequest = worker({
    fetch: async () => { throw Error('Offline'); },
    open: async () => { throw Error('Must not open cache for writing'); },
    match: async () => cached,
  });
  assert.equal(await fetchRequest(request), cached);
});
