// Shared, bounded acousto-optic behavior used by AOM and AOD elements.
//
// The workbench stays qualitative: an AOD is calibrated by its centre
// deflection and total angular scan range instead of pretending to know a
// particular crystal cut and acoustic velocity. Frequency, angle and optical
// frequency shift are still coupled, and wavelength-dependent steering is
// preserved.

const C_NM_PER_S = 2.99792458e17;

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function acoustoOpticShiftedWavelength(wavelengthNm, rfMHz, order = 1) {
  const wavelength = Math.max(1e-9, finite(wavelengthNm, 532));
  const driveHz = finite(rfMHz, 0) * 1e6;
  const sign = Number(order) < 0 ? -1 : 1;
  const opticalHz = C_NM_PER_S / wavelength;
  return C_NM_PER_S / Math.max(1, opticalHz + sign * driveHz);
}

export function aodDriveFrequencyMHz(params = {}, timeSeconds = 0) {
  const center = Math.max(0, finite(params.centerRfMHz, 80));
  if (params.scanMode === 'static' || !params.scanMode) {
    return Math.max(0, finite(params.rfMHz, center));
  }

  const bandwidth = Math.max(0, finite(params.bandwidthMHz, 40));
  const scanHz = Math.max(0, finite(params.scanFreqKHz, 10)) * 1e3;
  const phaseOffset = finite(params.scanPhaseDeg, 0) / 360;
  const phase = ((finite(timeSeconds, 0) * scanHz + phaseOffset) % 1 + 1) % 1;
  let wave;
  if (params.scanMode === 'sawtooth') wave = 2 * phase - 1;
  else wave = 1 - 4 * Math.abs(phase - 0.5); // triangle, bounded to [-1, 1]
  return Math.max(0, center + wave * bandwidth / 2);
}

export function aodDriveInBand(params = {}, rfMHz = aodDriveFrequencyMHz(params)) {
  const center = Math.max(0, finite(params.centerRfMHz, 80));
  const bandwidth = Math.max(0, finite(params.bandwidthMHz, 40));
  const drive = Math.max(0, finite(rfMHz, center));
  return bandwidth > 0 && Math.abs(drive - center) <= bandwidth / 2 + 1e-9;
}

export function aodDeflectionDeg(params = {}, wavelengthNm = 532, rfMHz = aodDriveFrequencyMHz(params)) {
  const centerFrequency = Math.max(0, finite(params.centerRfMHz, 80));
  const bandwidth = Math.max(1e-9, finite(params.bandwidthMHz, 40));
  const centerAngle = Math.max(0, finite(params.centerDeflect, 4));
  const scanRange = Math.max(0, finite(params.scanRange, 4));
  const designWavelength = Math.max(1e-9, finite(params.designWavelength, 532));
  const wavelength = Math.max(1e-9, finite(wavelengthNm, designWavelength));
  const order = Number(params.order) < 0 ? -1 : 1;

  // scanRange is the total angular travel across the full RF bandwidth.
  // Keep extrapolation finite for malformed/imported scenes; normal AOD rays
  // outside the configured band are rejected by aodDriveInBand().
  const normalizedFrequency = Math.max(-0.5, Math.min(0.5,
    (finite(rfMHz, centerFrequency) - centerFrequency) / bandwidth));
  const designAngle = centerAngle + normalizedFrequency * scanRange;
  return Math.max(-89, Math.min(89, order * designAngle * wavelength / designWavelength));
}
