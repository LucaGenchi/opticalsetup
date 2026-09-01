// Electro-optic phase modulation.
//
// A Pockels cell changes the refractive index in proportion to the applied
// field, so a voltage becomes an optical path change. What the crystal fixes
// is that path -- delta n times the length -- not the phase: a given drive
// writes the same optical path difference at every wavelength, and the phase
// it corresponds to therefore scales as 1/lambda. That is why a modulator is
// calibrated at one wavelength and why its half-wave voltage is quoted with
// one.
//
// The drive is specified as the peak phase it writes at the design
// wavelength, which is how a modulator is actually chosen -- a half-wave
// device, a quarter-wave device -- and converted to the fixed path difference
// the crystal really applies.

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

// Peak optical path difference, in mm, for a drive of `depthDeg` degrees at
// the design wavelength.
export function phaseModulatorPeakOpdMm(params = {}) {
  const depth = finite(params.depthDeg, 180);
  const design = Math.max(1, finite(params.designWavelength, 532));
  return depth / 360 * design * 1e-6;
}

// The drive waveform, normalised to [-1, 1].
export function phaseModulatorDrive(params = {}, timeSeconds = 0) {
  const mode = params.driveMode || 'static';
  if (mode === 'static') return 1;
  const freqHz = Math.max(1e-9, finite(params.freqMHz, 1)) * 1e6;
  const offset = finite(params.phaseDeg, 0) / 360;
  const phase = ((finite(timeSeconds, 0) * freqHz + offset) % 1 + 1) % 1;
  if (mode === 'square') return phase < 0.5 ? 1 : -1;
  return Math.sin(2 * Math.PI * phase);
}

// The optical path this modulator is adding right now, in mm.
export function phaseModulatorOpdMm(params = {}, timeSeconds = 0) {
  return phaseModulatorPeakOpdMm(params) * phaseModulatorDrive(params, timeSeconds);
}
