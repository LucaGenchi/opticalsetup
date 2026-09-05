import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { decodeSharePayload } from '../sketch/js/share.js';

const payload = text => `g.${gzipSync(text).toString('base64url')}`;

test('oversized decompression is cancelled before consuming the full stream', async t => {
  let chunksRead = 0, cancelled = false;
  t.mock.method(globalThis, 'DecompressionStream', function () {
    return {
      writable: new WritableStream(),
      readable: new ReadableStream({
        pull(controller) {
          chunksRead++;
          controller.enqueue(new Uint8Array(600_000));
          if (chunksRead === 10) controller.close();
        },
        cancel() { cancelled = true; },
      }),
    };
  });
  await assert.rejects(() => decodeSharePayload('g.AA'), /too large/i);
  assert.equal(cancelled, true, 'cancel the decompressor when the scene byte budget is exceeded');
  assert.ok(chunksRead < 10, 'do not inflate the entire payload before checking its size');
});

test('compressed scenes accept the exact byte budget and reject one byte over it', async () => {
  const accepted = JSON.stringify({ note: 'x'.repeat(999_989) });
  assert.equal(Buffer.byteLength(accepted), 1_000_000);
  assert.equal(await decodeSharePayload(payload(accepted)), accepted);
  const oversized = JSON.stringify({ note: 'x'.repeat(999_990) });
  await assert.rejects(() => decodeSharePayload(payload(oversized)), /too large/i);
});

test('broken gzip still reports damaged data', async () => {
  await assert.rejects(() => decodeSharePayload('g.AAAA'), /damaged|incomplete/i);
});
