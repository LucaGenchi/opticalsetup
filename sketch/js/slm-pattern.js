// Time-cycled 1D SLM phase patterns.
//
// A PNG supplies phi(y, t): image rows run along the SLM aperture, image
// columns are discrete animation frames, and grayscale maps linearly from
// 0 to 2pi. The stored payload is the 8-bit grayscale raster rather than the
// original PNG, which keeps tracing synchronous and makes save/load exact.

export const MAX_SLM_PATTERN_WIDTH = 512;
export const MAX_SLM_PATTERN_HEIGHT = 512;

const decodedPatterns = new WeakMap();
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

function decodedLength(base64) {
  if (!base64 || base64.length % 4 !== 0) return -1;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return base64.length / 4 * 3 - padding;
}

export function normalizePhaseCycle(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const width = Math.round(Number(value.width));
  const height = Math.round(Number(value.height));
  const data = typeof value.data === 'string' ? value.data : '';
  if (!Number.isFinite(width) || !Number.isFinite(height)
      || width < 1 || width > MAX_SLM_PATTERN_WIDTH
      || height < 1 || height > MAX_SLM_PATTERN_HEIGHT
      || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)
      || decodedLength(data) !== width * height) return null;
  const cleanName = String(value.name || 'pattern.png')
    .replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 120) || 'pattern.png';
  return { name: cleanName, width, height, data };
}

export function phaseCycleBytes(cycle) {
  if (!cycle || typeof cycle !== 'object') return null;
  const cached = decodedPatterns.get(cycle);
  if (cached) return cached;
  try {
    const raw = atob(cycle.data);
    if (raw.length !== cycle.width * cycle.height) return null;
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    decodedPatterns.set(cycle, bytes);
    return bytes;
  } catch (_) {
    return null;
  }
}

export function phaseCycleFrame(cycle, timeSeconds = 0, cycleTimeSeconds = 2) {
  const width = Math.max(1, Math.round(Number(cycle?.width) || 1));
  const duration = Math.max(0.1, Number(cycleTimeSeconds) || 2);
  const time = Number.isFinite(timeSeconds) ? timeSeconds : 0;
  const phase = ((time % duration) + duration) % duration / duration;
  return Math.min(width - 1, Math.floor(phase * width));
}

// Returns the local phase gradient in cycles/mm. Wrapping the difference to
// [-0.5, 0.5) treats 0 and 2pi as the same phase, so a blazed sawtooth does
// not acquire a spurious kick at every wrap.
export function phaseCycleGradient(cycle, aperturePosition01, timeSeconds, cycleTimeSeconds, apertureLengthMm) {
  const bytes = phaseCycleBytes(cycle);
  const width = Math.round(Number(cycle?.width));
  const height = Math.round(Number(cycle?.height));
  const length = Math.max(1e-6, Number(apertureLengthMm) || 0);
  if (!bytes || width < 1 || height < 2 || !Number.isFinite(length)) return 0;

  const row = Math.min(height - 1, Math.floor(clamp(Number(aperturePosition01) || 0, 0, 1) * height));
  const lo = Math.max(0, row - 1);
  const hi = Math.min(height - 1, row + 1);
  if (lo === hi) return 0;
  const frame = phaseCycleFrame(cycle, timeSeconds, cycleTimeSeconds);
  const a = bytes[lo * width + frame] / 255;
  const b = bytes[hi * width + frame] / 255;
  const rawDifference = b - a;
  const wrappedDifference = ((rawDifference + 0.5) % 1 + 1) % 1 - 0.5;
  const pixelPitch = length / height;
  return wrappedDifference / ((hi - lo) * pixelPitch);
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function decodeBitmap(file) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function decodePhaseCyclePNG(file) {
  if (!file) throw new Error('Choose a PNG pattern.');
  const signature = new Uint8Array(await file.slice(0, PNG_SIGNATURE.length).arrayBuffer());
  if (signature.length !== PNG_SIGNATURE.length
      || PNG_SIGNATURE.some((byte, index) => signature[index] !== byte)) {
    throw new Error('The SLM pattern must be a PNG image.');
  }

  const bitmap = await decodeBitmap(file);
  const width = bitmap.width || bitmap.naturalWidth;
  const height = bitmap.height || bitmap.naturalHeight;
  try {
    if (!width || !height) throw new Error('The PNG has no readable pixels.');
    if (width > MAX_SLM_PATTERN_WIDTH || height > MAX_SLM_PATTERN_HEIGHT) {
      throw new Error(`The PNG must be at most ${MAX_SLM_PATTERN_WIDTH} x ${MAX_SLM_PATTERN_HEIGHT} pixels.`);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('This browser could not read the PNG.');
    context.imageSmoothingEnabled = false;
    context.drawImage(bitmap, 0, 0, width, height);
    const rgba = context.getImageData(0, 0, width, height).data;
    const grayscale = new Uint8Array(width * height);
    for (let i = 0; i < grayscale.length; i++) {
      const offset = i * 4;
      const luminance = 0.2126 * rgba[offset] + 0.7152 * rgba[offset + 1] + 0.0722 * rgba[offset + 2];
      grayscale[i] = Math.round(luminance * rgba[offset + 3] / 255);
    }
    return {
      name: file.name || 'pattern.png',
      width,
      height,
      data: bytesToBase64(grayscale),
    };
  } finally {
    if (typeof bitmap.close === 'function') bitmap.close();
  }
}
