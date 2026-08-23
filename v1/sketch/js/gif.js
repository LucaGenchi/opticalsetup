// Small dependency-free GIF89a encoder for deterministic browser exports.
// Frames use one fixed RGB332 palette: this keeps memory and output bounded
// while remaining honest about GIF's 256-colour limitation.

const MAX_GIF_FRAMES = 240;
const MAX_GIF_PIXELS = 1_500_000;
const MAX_GIF_TOTAL_PIXELS = 120_000_000;

function finiteInteger(value, min, max, label) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${label} must be between ${min} and ${max}`);
  }
  return number;
}

export function validateGIFOptions({ width, height, fps, frameCount }) {
  const w = finiteInteger(width, 1, 4096, 'GIF width');
  const h = finiteInteger(height, 1, 4096, 'GIF height');
  const rate = finiteInteger(fps, 1, 50, 'Frame rate');
  const count = finiteInteger(frameCount, 1, MAX_GIF_FRAMES, 'Frame count');
  if (w * h > MAX_GIF_PIXELS) throw new Error('GIF resolution is too large');
  if (w * h * count > MAX_GIF_TOTAL_PIXELS) {
    throw new Error('GIF capture is too large; shorten it, lower the frame rate, or reduce its size');
  }
  return { width: w, height: h, fps: rate, frameCount: count };
}

export function rgb332Index(r, g, b) {
  return ((r & 0xe0) | ((g & 0xe0) >> 3) | (b >> 6)) & 0xff;
}

function rgb332Palette() {
  const bytes = new Uint8Array(256 * 3);
  for (let value = 0; value < 256; value++) {
    bytes[value * 3] = Math.round(((value >> 5) & 7) * 255 / 7);
    bytes[value * 3 + 1] = Math.round(((value >> 2) & 7) * 255 / 7);
    bytes[value * 3 + 2] = Math.round((value & 3) * 255 / 3);
  }
  return bytes;
}

function pushWord(out, value) {
  out.push(value & 0xff, (value >> 8) & 0xff);
}

function lzwData(indices) {
  const clear = 256, end = 257;
  const bytes = [];
  let accumulator = 0, bitCount = 0;
  let codeSize, nextCode, dictionary;
  const reset = () => {
    codeSize = 9;
    nextCode = 258;
    dictionary = new Map();
  };
  const write = code => {
    accumulator |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      bytes.push(accumulator & 0xff);
      accumulator >>>= 8;
      bitCount -= 8;
    }
  };

  reset();
  write(clear);
  let prefix = indices[0] ?? 0;
  for (let i = 1; i < indices.length; i++) {
    const suffix = indices[i];
    const key = prefix * 256 + suffix;
    const found = dictionary.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    write(prefix);
    if (nextCode < 4096) {
      dictionary.set(key, nextCode++);
      // The decoder creates this entry after consuming the next emitted code,
      // so the encoder changes width one dictionary entry later.
      if (nextCode > (1 << codeSize) && codeSize < 12) codeSize++;
    } else {
      write(clear);
      reset();
    }
    prefix = suffix;
  }
  write(prefix);
  write(end);
  if (bitCount) bytes.push(accumulator & 0xff);
  return bytes;
}

export function encodeGIF({ width, height, fps, frames }) {
  const options = validateGIFOptions({ width, height, fps, frameCount: frames?.length });
  const expected = options.width * options.height;
  const out = [...new TextEncoder().encode('GIF89a')];
  pushWord(out, options.width);
  pushWord(out, options.height);
  out.push(0xf7, 0xff, 0x00, ...rgb332Palette());
  // Netscape loop extension: repeat forever.
  out.push(0x21, 0xff, 0x0b, ...new TextEncoder().encode('NETSCAPE2.0'), 0x03, 0x01, 0x00, 0x00, 0x00);
  const delay = Math.max(2, Math.round(100 / options.fps));

  for (const frame of frames) {
    if (!(frame instanceof Uint8Array) || frame.length !== expected) {
      throw new Error('Every GIF frame must match the export dimensions');
    }
    out.push(0x21, 0xf9, 0x04, 0x04);
    pushWord(out, delay);
    out.push(0x00, 0x00);
    out.push(0x2c, 0x00, 0x00, 0x00, 0x00);
    pushWord(out, options.width);
    pushWord(out, options.height);
    out.push(0x00, 0x08);
    const compressed = lzwData(frame);
    for (let i = 0; i < compressed.length; i += 255) {
      const block = compressed.slice(i, i + 255);
      out.push(block.length, ...block);
    }
    out.push(0x00);
  }
  out.push(0x3b);
  return new Uint8Array(out);
}

export function imageDataToRGB332(imageData) {
  const source = imageData?.data;
  if (!source || source.length % 4) throw new Error('Invalid canvas image data');
  const result = new Uint8Array(source.length / 4);
  for (let i = 0, pixel = 0; i < source.length; i += 4, pixel++) {
    // Export frames have an opaque white background, but keep transparent
    // input deterministic if this helper is reused.
    result[pixel] = source[i + 3] < 128 ? 0xff : rgb332Index(source[i], source[i + 1], source[i + 2]);
  }
  return result;
}
