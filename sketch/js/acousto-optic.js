// Shared, bounded acousto-optic behavior used by the AOM and AOD elements.
//
// A real deflector is steered by the frequency of its RF drive: the Bragg
// condition gives a deflection angle theta = lambda * f / v, where v is the
// acoustic velocity in the crystal. Everything a user cares about --- where
// the beam points and how far it sweeps --- is that relation read forwards,
// and every device is sold by the angles rather than by the crystal. So the
// angles are what this element takes: a centre deflection and a total scan
// angle, with the drive frequency left implicit behind them.
//
// What that costs is the optical frequency shift, which a deflector does
// apply. It is not modelled here because it cannot be seen: 80 MHz moves
// 532 nm by 7.6e-5 nm, more than a thousand times finer than the finest
// wavelength this workbench resolves, and it is "usually irrelevant for
// applications of beam deflectors" in any case. The AOM, which is defined by
// its drive frequency, still carries it.

const C_NM_PER_S = 2.99792458e17;

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

export function acoustoOpticShiftedWavelength(wavelengthNm, rfMHz, order = 1) {
  const wavelength = Math.max(1e-9, finite(wavelengthNm, 532));
  const driveHz = finite(rfMHz, 0) * 1e6;
  const sign = Number(order) < 0 ? -1 : 1;
  const opticalHz = C_NM_PER_S / wavelength;
  return C_NM_PER_S / Math.max(1, opticalHz + sign * driveHz);
}

// A deterministic hash, so "random" addressing is random in the way a real
// random-access deflector is --- an unpredictable order of spots --- without
// being random frame to frame. The beam has to sit still between jumps, and
// redrawing the same instant twice has to give the same answer.
function hashUnitInterval(step) {
  let x = Math.imul(step ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// Where in its scan the deflector is pointing, as a fraction of the total
// scan angle either side of centre: -0.5 at one end, +0.5 at the other.
export function aodScanPosition(params = {}, timeSeconds = 0) {
  const mode = params.scanMode || 'static';
  if (mode === 'static') return 0;

  const rateHz = Math.max(1e-6, finite(params.scanFreqKHz, 10)) * 1e3;
  const time = Math.max(0, finite(timeSeconds, 0));

  if (mode === 'random') {
    // Address one spot per step and hold it: a random-access deflector jumps
    // and settles rather than sweeping through the angles in between.
    return hashUnitInterval(Math.floor(time * rateHz)) - 0.5;
  }

  const phaseOffset = finite(params.scanPhaseDeg, 0) / 360;
  const phase = ((time * rateHz + phaseOffset) % 1 + 1) % 1;
  // Sawtooth flies back instantly; a triangle retraces, so it spends the
  // second half of its period scanning backwards.
  return mode === 'sawtooth' ? phase - 0.5 : 0.5 - Math.abs(2 * phase - 1);
}

// theta = lambda f / v is linear in both the drive frequency and the optical
// wavelength. Reading it forwards from the angles the user set: the scan is
// linear in position by construction, and the wavelength scaling survives as
// the ratio to the wavelength the device was calibrated at. A beam at twice
// the design wavelength really does deflect twice as far, which is why one
// deflector cannot serve two distant colours without recalibration.
export function aodDeflectionDeg(params = {}, wavelengthNm = 532, position = aodScanPosition(params)) {
  const centre = Math.max(0, finite(params.centerDeflect, 4));
  const scanRange = Math.max(0, finite(params.scanRange, 2));
  const designWavelength = Math.max(1e-9, finite(params.designWavelength, 532));
  const wavelength = Math.max(1e-9, finite(wavelengthNm, designWavelength));
  const order = Number(params.order) < 0 ? -1 : 1;
  const where = clamp(finite(position, 0), -0.5, 0.5);
  const designAngle = centre + where * scanRange;
  return clamp(order * designAngle * wavelength / designWavelength, -89, 89);
}
