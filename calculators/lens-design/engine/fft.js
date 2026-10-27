// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// A radix-2 complex FFT, in place, on separate real and imaginary arrays,
// and its two-dimensional form on a square row-major grid. Forward only,
// with no normalization:
//
//   F[k] = Σ_n f[n] exp(−2πi k n / M)
//
// which is all the diffraction code needs (Parseval then reads
// Σ|F|² = M Σ|f|² in one dimension, M² Σ|f|² in two).

export const isPowerOfTwo = m => Number.isInteger(m) && m > 0 && (m & (m - 1)) === 0;

const twiddles = new Map();
function table(m) {
  let t = twiddles.get(m);
  if (!t) {
    t = { cos: new Float64Array(m / 2), sin: new Float64Array(m / 2) };
    for (let k = 0; k < m / 2; k++) {
      t.cos[k] = Math.cos(2 * Math.PI * k / m);
      t.sin[k] = -Math.sin(2 * Math.PI * k / m);
    }
    twiddles.set(m, t);
  }
  return t;
}

// One transform of length m on re/im starting at `offset` with `stride`.
function fft1(re, im, m, offset, stride, t) {
  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < m; i++) {
    let bit = m >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const a = offset + i * stride, b = offset + j * stride;
      let x = re[a]; re[a] = re[b]; re[b] = x;
      x = im[a]; im[a] = im[b]; im[b] = x;
    }
  }
  for (let size = 2; size <= m; size <<= 1) {
    const half = size >> 1, step = m / size;
    for (let start = 0; start < m; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = t.cos[k * step], wi = t.sin[k * step];
        const a = offset + (start + k) * stride, b = a + half * stride;
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
      }
    }
  }
}

export function fft(re, im) {
  const m = re.length;
  if (!isPowerOfTwo(m) || im.length !== m) throw new Error('fft: length must be a power of two');
  fft1(re, im, m, 0, 1, table(m));
}

// Two-dimensional transform of an m × m grid stored row by row.
export function fft2(re, im, m) {
  if (!isPowerOfTwo(m) || re.length !== m * m || im.length !== m * m) throw new Error('fft2: the grid must be m × m with m a power of two');
  const t = table(m);
  for (let r = 0; r < m; r++) fft1(re, im, m, r * m, 1, t);
  for (let c = 0; c < m; c++) fft1(re, im, m, c, m, t);
}
