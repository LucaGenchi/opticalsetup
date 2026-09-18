// Scalar, single-mode envelope numerics. Units: fs, metres, watts.
// FFT forward uses exp(-i Ωt); propagation uses exp(+i GDD Ω²/2).
// Physical carrier convention: E = A(t) exp(-i ω₀t), hence ω = ω₀ - Ω.
export function fft(re, im, inverse = false) {
  const n = re.length;
  if (n !== im.length || n < 2 || (n & (n - 1))) throw new Error('FFT requires equal power-of-two arrays');
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let size = 2; size <= n; size *= 2) {
    const angle = (inverse ? 2 : -2) * Math.PI / size;
    const wr = Math.cos(angle), wi = Math.sin(angle);
    for (let start = 0; start < n; start += size) {
      let ur = 1, ui = 0;
      for (let j = 0; j < size / 2; j++) {
        const a = start + j, b = a + size / 2;
        const tr = ur * re[b] - ui * im[b], ti = ur * im[b] + ui * re[b];
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const next = ur * wr - ui * wi; ui = ur * wi + ui * wr; ur = next;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
const omega = (i, n, dt) => 2 * Math.PI * (i < n / 2 ? i : i - n) / (n * dt);
function phase(re, im, dt, gdd) {
  for (let i = 0; i < re.length; i++) {
    const phi = gdd * omega(i, re.length, dt) ** 2 / 2;
    const c = Math.cos(phi), s = Math.sin(phi), a = re[i];
    re[i] = a * c - im[i] * s; im[i] = a * s + im[i] * c;
  }
}
function disperse(re, im, dt, gdd) {
  if (!gdd) return;
  fft(re, im); phase(re, im, dt, gdd); fft(re, im, true);
}
const powers = (re, im) => Array.from(re, (v, i) => v * v + im[i] * im[i]);
function distribution(w, dx) {
  const total = w.reduce((a, b) => a + b, 0), peak = Math.max(...w);
  if (!(total > 0) || !Number.isFinite(total)) return null;
  const mean = w.reduce((a, b, i) => a + i * b, 0) / total;
  const rms = Math.sqrt(w.reduce((a, b, i) => a + (i - mean) ** 2 * b, 0) / total) * dx;
  const first = w.findIndex(v => v >= peak / 2);
  let last = w.length - 1; while (last > first && w[last] < peak / 2) last--;
  const left = first > 0 ? first - (w[first] - peak / 2) / (w[first] - w[first - 1]) : first;
  const right = last < w.length - 1 ? last + (w[last] - peak / 2) / (w[last] - w[last + 1]) : last;
  const edge = w.slice(0, Math.ceil(w.length / 32)).concat(w.slice(-Math.ceil(w.length / 32))).reduce((a, b) => a + b, 0) / total;
  return { total, peak, rms, fwhm: (right - left) * dx, edge };
}
const measurements = new WeakMap();
export function fieldMetrics(field, gddFs2 = field?.referenceGddFs2 || 0) {
  if (!field || !Number.isFinite(gddFs2)) return null;
  let cache = measurements.get(field);
  if (!cache) { cache = new Map(); measurements.set(field, cache); }
  if (cache.has(gddFs2)) return cache.get(gddFs2);
  const re = Float64Array.from(field.re), im = Float64Array.from(field.im);
  phase(re, im, field.dtFs, gddFs2 - field.referenceGddFs2);
  fft(re, im, true);
  const intensity = powers(re, im), stats = distribution(intensity, field.dtFs);
  const result = stats && stats.edge < 1e-5 ? {
    fwhmFs: stats.fwhm, rmsFs: stats.rms, peakPowerW: stats.peak,
    energyJ: stats.total * field.dtFs * 1e-15,
    timeFs: intensity.map((_, i) => (i - intensity.length / 2) * field.dtFs),
    intensity: intensity.map(v => v / stats.peak),
  } : null;
  if (cache.size >= 24) cache.clear(); cache.set(gddFs2, result);
  return result;
}

export function fieldSpectrum(field) {
  const n = field.re.length, w = powers(field.re, field.im), cNmFs = 299.792458;
  const samples = w.map((value, i) => {
    const frequency = cNmFs / field.wavelengthNm - omega(i, n, field.dtFs) / (2 * Math.PI);
    const nm = cNmFs / frequency;
    return { nm, w: value * cNmFs / (nm * nm) }; // Jacobian dν/dλ
  }).filter(p => Number.isFinite(p.nm) && p.nm > 0).sort((a, b) => a.nm - b.nm);
  const peak = Math.max(...samples.map(p => p.w));
  const kept = samples.filter(p => p.w > peak * 1e-6);
  if (kept.length < 3) return null;
  const lo = kept[0].nm, hi = kept.at(-1).nm, grid = [];
  let j = 0;
  for (let i = 0; i < 257; i++) {
    const nm = lo + (hi - lo) * i / 256;
    while (j + 1 < samples.length - 1 && samples[j + 1].nm < nm) j++;
    const a = samples[j], b = samples[j + 1];
    grid.push((a.w + (b.w - a.w) * (nm - a.nm) / (b.nm - a.nm)) / peak);
  }
  return { kind: 'sampled', lo, hi, w: grid };
}

export function propagateEnvelope({ pulseWidthFs, energyJ, wavelengthNm, lengthM, beta2Fs2PerM,
  gammaPerWM, lossDbPerM = 0, inputGddFs2 = 0, samples = 1024, steps: requestedSteps }) {
  const inputs = [pulseWidthFs, energyJ, wavelengthNm, lengthM, beta2Fs2PerM, gammaPerWM, lossDbPerM, inputGddFs2];
  if (!inputs.every(Number.isFinite) || pulseWidthFs < 15 || pulseWidthFs > 500 || energyJ <= 0
    || wavelengthNm < 500 || wavelengthNm > 1800 || lengthM < 0 || lengthM > 10
    || gammaPerWM < 0 || lossDbPerM < 0 || ![512, 1024, 2048].includes(samples)) {
    return { ok: false, reason: 'Envelope model needs 15–500 fs, 500–1800 nm pulses and at most 10 m of fiber.' };
  }
  const peakPower = energyJ / (pulseWidthFs * 1e-15 * Math.sqrt(Math.PI / (4 * Math.log(2))));
  const bEstimate = gammaPerWM * peakPower * lengthM;
  const totalGdd = inputGddFs2 + beta2Fs2PerM * lengthM;
  const stretch = Math.sqrt(1 + (4 * Math.log(2) * Math.max(Math.abs(totalGdd), Math.abs(inputGddFs2)) / pulseWidthFs ** 2) ** 2);
  if (bEstimate > 12 || stretch > 6) return { ok: false, reason: 'Outside envelope model bounds: reduce energy, pressure, length or input chirp.' };
  const windowFs = 24 * pulseWidthFs * Math.max(1, stretch), dtFs = windowFs / samples;
  const re = new Float64Array(samples), im = new Float64Array(samples);
  for (let i = 0; i < samples; i++) re[i] = Math.sqrt(peakPower) * Math.exp(-2 * Math.log(2) * ((i - samples / 2) * dtFs / pulseWidthFs) ** 2);
  disperse(re, im, dtFs, inputGddFs2);
  const steps = requestedSteps ?? Math.max(32, Math.ceil(bEstimate * 32));
  if (!Number.isInteger(steps) || steps < 1 || steps > 2048) return { ok: false, reason: 'Invalid propagation step count.' };
  const dz = lengthM / steps, alpha = lossDbPerM * Math.log(10) / 10;
  const amplitudeLoss = Math.exp(-alpha * dz / 4);
  let bIntegral = 0, maxPeakPowerW = 0;
  for (let step = 0; step < steps; step++) {
    disperse(re, im, dtFs, beta2Fs2PerM * dz / 2);
    let localPeak = 0;
    for (let i = 0; i < samples; i++) {
      re[i] *= amplitudeLoss; im[i] *= amplitudeLoss;
      const power = re[i] ** 2 + im[i] ** 2;
      localPeak = Math.max(localPeak, power);
      const phi = gammaPerWM * power * dz, c = Math.cos(phi), s = Math.sin(phi), a = re[i];
      re[i] = (a * c - im[i] * s) * amplitudeLoss;
      im[i] = (a * s + im[i] * c) * amplitudeLoss;
    }
    maxPeakPowerW = Math.max(maxPeakPowerW, localPeak);
    bIntegral += gammaPerWM * localPeak * dz;
    disperse(re, im, dtFs, beta2Fs2PerM * dz / 2);
  }
  fft(re, im);
  const spectralPower = powers(re, im), shifted = spectralPower.slice(samples / 2).concat(spectralPower.slice(0, samples / 2));
  const spectralStats = distribution(shifted, 1 / windowFs);
  if (!spectralStats || spectralStats.edge > 1e-6) return { ok: false, reason: 'Spectrum exceeds the numerical grid; reduce nonlinear broadening.' };
  const field = { re: Array.from(re), im: Array.from(im), dtFs, wavelengthNm, referenceGddFs2: totalGdd };
  const metrics = fieldMetrics(field), spectrum = fieldSpectrum(field);
  if (!metrics || !spectrum || spectrum.lo < 467.9 || spectrum.hi > 2058.7
    || (spectrum.hi - spectrum.lo) / wavelengthNm > 0.8) {
    return { ok: false, reason: 'Pulse exceeds the temporal, bandwidth or argon-dispersion model window.' };
  }
  return { ok: true, field, metrics, spectrum, bIntegral, maxPeakPowerW, spectralRmsTHz: spectralStats.rms * 1000, steps };
}
