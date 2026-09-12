// Cross-site handoff from an illuminated 2PP resin sample to the dedicated
// two-photon lithography lab. The query contract is deliberately small and
// versioned so the destination can validate every value independently.

export const TWO_PHOTON_LAB_URL = 'https://twophotonlithography.com/lab';

const finite = value => typeof value === 'number' && Number.isFinite(value);

function formatQueryNumber(value) {
  return value.toFixed(12).replace(/0+$/, '').replace(/\.$/, '');
}

export function buildTwoPhotonHandoffUrl(laser, baseUrl = TWO_PHOTON_LAB_URL, options = {}) {
  if (laser?.type !== 'pulsedlaser') return null;
  const p = laser.params;
  if (![p.wavelength, p.avgPowerW, p.repRateMHz, p.pulseWidthFs].every(finite)) return null;
  if (p.wavelength <= 0 || p.avgPowerW < 0 || p.repRateMHz <= 0 || p.pulseWidthFs <= 0) return null;
  if (p.wavelength < 500 || p.wavelength > 1064
    || p.avgPowerW > 1
    || p.repRateMHz < 10 || p.repRateMHz > 100
    || p.pulseWidthFs < 50 || p.pulseWidthFs > 400) return null;

  const url = new URL(baseUrl);
  url.searchParams.set('from', 'opticalsetup');
  url.searchParams.set('v', '1');
  url.searchParams.set('wavelengthNm', formatQueryNumber(p.wavelength));
  url.searchParams.set('sourcePowerMw', formatQueryNumber(p.avgPowerW * 1000));
  url.searchParams.set('repetitionRateMHz', formatQueryNumber(p.repRateMHz));
  url.searchParams.set('pulseDurationFs', formatQueryNumber(p.pulseWidthFs));
  if (finite(options.numericalAperture)
    && options.numericalAperture >= 0.01 && options.numericalAperture <= 1.49) {
    url.searchParams.set('numericalAperture', formatQueryNumber(options.numericalAperture));
  }
  return url.toString();
}

export function twoPhotonLaserCandidates(elements = [], signalHits = [], stageId = '') {
  const sourceIds = new Set(signalHits
    .filter(hit => hit?.stageId === stageId && typeof hit.sourceId === 'string')
    .map(hit => hit.sourceId));

  return elements.filter(element => sourceIds.has(element?.id)
    && element.type === 'pulsedlaser'
    && element.params?.handoffEnabled !== false
    && buildTwoPhotonHandoffUrl(element));
}

export function twoPhotonHandoffCandidates(elements = [], signalHits = [], stageId = '') {
  return twoPhotonLaserCandidates(elements, signalHits, stageId).map(laser => {
    const hits = signalHits.filter(hit => hit?.stageId === stageId && hit.sourceId === laser.id);
    const allHaveNA = hits.length > 0 && hits.every(hit => finite(hit.objectiveNA));
    const nas = new Set(hits.filter(hit => finite(hit.objectiveNA)).map(hit => hit.objectiveNA));
    // A dispersed band carries one estimate per sampled wavelength. Report
    // the pulse's centre-wavelength path instead of averaging unlike colours.
    const nearestDistance = Math.min(...hits.map(hit => finite(hit.wavelengthNm)
      ? Math.abs(hit.wavelengthNm - laser.params.wavelength) : Number.POSITIVE_INFINITY));
    const centerHits = hits.filter(hit => finite(hit.wavelengthNm)
      && Math.abs(Math.abs(hit.wavelengthNm - laser.params.wavelength) - nearestDistance) < 1e-7);
    const stretched = centerHits.map(hit => hit.stretchedPulseWidthFs).filter(finite);
    const gdds = centerHits.map(hit => hit.gddFs2).filter(finite);
    return {
      laser,
      numericalAperture: allHaveNA && nas.size === 1 ? [...nas][0] : null,
      stretchedPulseWidthFs: stretched.length
        ? stretched.reduce((sum, value) => sum + value, 0) / stretched.length
        : null,
      gddFs2: gdds.length ? gdds.reduce((sum, value) => sum + value, 0) / gdds.length : 0,
    };
  });
}

// Published setups may specify only some quantities, or operate outside the
// educational lab's ranges. Export exactly the accepted subset: never fill
// unknowns with source defaults or clamp kHz amplifiers into MHz oscillators.
export const PAPER_HANDOFF_FIELDS = Object.freeze([
  { key: 'wavelengthNm', label: 'Wavelength', unit: 'nm', min: 500, max: 1064 },
  { key: 'sourcePowerMw', label: 'Source power', unit: 'mW', min: 0, max: 1000 },
  { key: 'repetitionRateMHz', label: 'Repetition rate', unit: 'MHz', min: 10, max: 100 },
  { key: 'pulseDurationFs', label: 'Pulse duration', unit: 'fs', min: 50, max: 400 },
  { key: 'numericalAperture', label: 'Numerical aperture', unit: '', min: 0.01, max: 1.49 },
]);

export function buildPaperHandoff(settings = {}, baseUrl = TWO_PHOTON_LAB_URL) {
  const url = new URL(baseUrl);
  url.searchParams.set('from', 'opticalsetup');
  url.searchParams.set('v', '1');
  url.searchParams.set('basis', 'paper');
  const imported = [], omitted = [];
  for (const field of PAPER_HANDOFF_FIELDS) {
    // A reused URL must not retain a value that this paper cannot support.
    url.searchParams.delete(field.key);
    const value = settings?.[field.key];
    if (!finite(value)) {
      omitted.push({ ...field, value: null, reason: 'No verified exact value' });
    } else if (value < field.min || value > field.max) {
      omitted.push({ ...field, value, reason: `Outside lab range ${field.min}–${field.max} ${field.unit}`.trim() });
    } else {
      imported.push({ ...field, value });
      url.searchParams.set(field.key, formatQueryNumber(value));
    }
  }
  return { url: imported.length ? url.toString() : null, imported, omitted };
}
