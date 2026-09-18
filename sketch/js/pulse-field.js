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

// Intensity autocorrelation of a sampled envelope, A(tau) = ∫ I(t) I(t+tau) dt,
// which is what an intensity autocorrelator records. Computed through the
// Wiener–Khinchin relation, |F{I}|² transformed back, on a grid padded to
// twice the envelope's window so the correlation does not wrap around. The
// trace is normalised to its peak at zero delay; its FWHM is measured the
// same way the envelope's is. Cached per envelope, since screens and the
// inspector ask for it on every redraw.
//
// Preconditions: `timeFs` is a uniform, increasing grid; the samples are
// finite; and the envelope is contained in its window. Padding prevents
// wrap-around but cannot recover wings cut off at the window's edge -- the
// production caller's envelopes come from fieldMetrics, which rejects any
// with 1e-5 or more of their energy at the edges. The FWHM, like the
// envelope's, runs between the outermost half-height crossings, so for a
// trace with separate lobes it spans all of them.
const autocorrelations = new WeakMap();
export function envelopeAutocorrelation(envelope) {
  const intensity = envelope?.intensity, timeFs = envelope?.timeFs;
  if (!Array.isArray(intensity) || !Array.isArray(timeFs) || intensity.length < 4) return null;
  if (autocorrelations.has(intensity)) return autocorrelations.get(intensity);
  const n = intensity.length, dt = timeFs[1] - timeFs[0];
  let size = 1;
  while (size < 2 * n) size *= 2;
  const re = new Float64Array(size), im = new Float64Array(size);
  for (let i = 0; i < n; i++) re[i] = Math.max(0, intensity[i]);
  fft(re, im);
  for (let i = 0; i < size; i++) { re[i] = re[i] * re[i] + im[i] * im[i]; im[i] = 0; }
  fft(re, im, true);
  // Lag k sits at index k (and size − k for negative lags): unwrap to a
  // centred trace over ±(n − 1) samples.
  const lags = [], trace = [];
  for (let k = -(n - 1); k <= n - 1; k++) {
    lags.push(k * dt);
    trace.push(re[(k + size) % size]);
  }
  const peak = trace[n - 1];
  if (!(peak > 0)) return null;
  const normalised = trace.map(v => Math.max(0, v) / peak);
  const stats = distribution(normalised, dt);
  const result = stats ? { tauFs: lags, trace: normalised, fwhmFs: stats.fwhm } : null;
  autocorrelations.set(intensity, result);
  return result;
}

// The intensity FWHM of a pulse with a given power spectrum and a purely
// quadratic spectral phase. `density(nm)` is the spectral power per nm over
// [loNm, hiNm]; it is taken to angular frequency with its Jacobian, its square
// root is the field amplitude, and the pulse is its transform. Returns the
// duration at `gddFs2` and the transform limit (gddFs2 = 0).
//
// A strongly chirped pulse needs a time window far longer than its transform
// limit. Past MAX_SPECTRAL_POINTS the stationary-phase limit is used instead,
// where the intensity is the spectrum mapped to time, t = GDD·Ω -- exact to
// well under a percent by then, since that only happens once GDD·Δω² ≫ 1.
const MAX_SPECTRAL_POINTS = 1 << 15;
export function quadraticPhasePulse(density, loNm, hiNm, gddFs2 = 0) {
  const cNmFs = 299.792458;
  if (!(hiNm > loNm) || !(loNm > 0) || !Number.isFinite(gddFs2)) return null;
  const wLo = 2 * Math.PI * cNmFs / hiNm, wHi = 2 * Math.PI * cNmFs / loNm, width = wHi - wLo;
  // Power per unit angular frequency, from power per nm: |dλ/dω| = λ²/(2πc).
  const spectral = w => {
    const nm = 2 * Math.PI * cNmFs / w;
    return nm >= loNm && nm <= hiNm ? Math.max(0, Number(density(nm)) || 0) * nm * nm / (2 * Math.PI * cNmFs) : 0;
  };
  // Centre on the power-weighted mean frequency.
  let total = 0, first = 0;
  for (let i = 0; i < 2048; i++) {
    const w = wLo + width * (i + 0.5) / 2048, s = spectral(w);
    total += s; first += s * w;
  }
  if (!(total > 0)) return null;
  const w0 = first / total;
  const at = (gdd, stretched) => {
    // The window has to hold the transform limit (about 2π/width) and the
    // chirp's spread (|GDD|·width) several times over; the grid spans four
    // times the band so the time step resolves the transform limit.
    const span = 4 * width;
    const needed = 3 * (Math.abs(gdd) * width + 40 * Math.PI / width);
    const step = Math.min(width / 512, 2 * Math.PI / needed);
    const n = 2 ** Math.ceil(Math.log2(span / step));
    if (n > MAX_SPECTRAL_POINTS) return stretched();
    const dt = 2 * Math.PI / (n * step);
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const k = i < n / 2 ? i : i - n, offset = k * step;
      // (-1)^k centres the pulse in the window so its FWHM is contiguous.
      const a = Math.sqrt(spectral(w0 + offset)) * (k % 2 ? -1 : 1);
      const phi = gdd * offset * offset / 2;
      re[i] = a * Math.cos(phi); im[i] = a * Math.sin(phi);
    }
    fft(re, im, true);
    const stats = distribution(powers(re, im), dt);
    return stats && stats.edge < 1e-4 ? stats.fwhm : stretched();
  };
  const mapped = () => {
    const samples = Array.from({ length: 4096 }, (_, i) => spectral(wLo + width * (i + 0.5) / 4096));
    const stats = distribution(samples, width / 4096);
    return stats ? stats.fwhm * Math.abs(gddFs2) : null;
  };
  const transformLimitFs = at(0, () => null);
  const durationFs = gddFs2 ? at(gddFs2, mapped) : transformLimitFs;
  return Number.isFinite(durationFs) && durationFs > 0
    ? { durationFs, transformLimitFs: Number.isFinite(transformLimitFs) ? transformLimitFs : null, bandwidthRadPerFs: width }
    : null;
}
