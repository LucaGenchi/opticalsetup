import test from 'node:test';
import assert from 'node:assert/strict';

import { encodeGIF, imageDataToRGB332, rgb332Index, validateGIFOptions } from '../sketch/js/gif.js';

function firstFrameIndices(bytes) {
  let offset = 13 + 256 * 3;
  while (bytes[offset] === 0x21) {
    offset += 2;
    while (bytes[offset]) offset += 1 + bytes[offset];
    offset++;
  }
  assert.equal(bytes[offset++], 0x2c);
  offset += 8;
  const packed = bytes[offset++];
  if (packed & 0x80) offset += 3 * (1 << ((packed & 7) + 1));
  const minimumSize = bytes[offset++];
  const compressed = [];
  while (bytes[offset]) {
    const size = bytes[offset++];
    compressed.push(...bytes.slice(offset, offset + size));
    offset += size;
  }

  const clear = 1 << minimumSize, end = clear + 1;
  let dictionary, codeSize, nextCode, bitOffset = 0, previous = null;
  const reset = () => {
    dictionary = Array.from({ length: clear }, (_, value) => [value]);
    dictionary[clear] = null;
    dictionary[end] = null;
    codeSize = minimumSize + 1;
    nextCode = end + 1;
  };
  const read = () => {
    let code = 0;
    for (let bit = 0; bit < codeSize; bit++) {
      code |= ((compressed[bitOffset >> 3] >> (bitOffset & 7)) & 1) << bit;
      bitOffset++;
    }
    return code;
  };
  const result = [];
  reset();
  while (bitOffset + codeSize <= compressed.length * 8) {
    const code = read();
    if (code === clear) { reset(); previous = null; continue; }
    if (code === end) break;
    const entry = dictionary[code] || (code === nextCode && previous ? [...previous, previous[0]] : null);
    assert.ok(entry, `invalid GIF LZW code ${code}`);
    result.push(...entry);
    if (previous) {
      dictionary[nextCode++] = [...previous, entry[0]];
      if (nextCode === (1 << codeSize) && codeSize < 12) codeSize++;
    }
    previous = entry;
  }
  return result;
}

test('RGB332 conversion is deterministic and keeps white as the white palette entry', () => {
  assert.equal(rgb332Index(255, 255, 255), 255);
  assert.equal(rgb332Index(255, 0, 0), 224);
  const pixels = imageDataToRGB332({ data: new Uint8ClampedArray([
    255, 0, 0, 255,
    0, 255, 0, 255,
    1, 2, 3, 0,
  ]) });
  assert.deepEqual([...pixels], [224, 28, 255]);
});

test('GIF encoder writes a looping GIF89a stream with the requested canvas and frames', () => {
  const bytes = encodeGIF({
    width: 2,
    height: 1,
    fps: 20,
    frames: [new Uint8Array([224, 28]), new Uint8Array([28, 224])],
  });
  assert.equal(new TextDecoder().decode(bytes.slice(0, 6)), 'GIF89a');
  assert.deepEqual([...bytes.slice(6, 10)], [2, 0, 1, 0]);
  assert.ok(new TextDecoder().decode(bytes).includes('NETSCAPE2.0'));
  assert.equal(bytes.at(-1), 0x3b);
});

test('GIF LZW stream decodes across code-width changes', () => {
  const frame = Uint8Array.from({ length: 40 * 30 }, (_, index) => (index * 37 + Math.floor(index / 11)) & 0xff);
  const bytes = encodeGIF({ width: 40, height: 30, fps: 20, frames: [frame] });
  assert.deepEqual(firstFrameIndices(bytes), [...frame]);
});

test('GIF limits reject runaway captures and mismatched frames', () => {
  assert.throws(() => validateGIFOptions({ width: 1600, height: 1000, fps: 20, frameCount: 1 }), /resolution/i);
  assert.throws(() => validateGIFOptions({ width: 100, height: 100, fps: 30, frameCount: 241 }), /frame count/i);
  assert.throws(() => validateGIFOptions({ width: 1200, height: 1200, fps: 20, frameCount: 100 }), /capture is too large/i);
  assert.throws(() => encodeGIF({ width: 2, height: 2, fps: 20, frames: [new Uint8Array(3)] }), /dimensions/i);
});
