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
    && options.numericalAperture >= 0.7 && options.numericalAperture <= 1.49) {
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
    && buildTwoPhotonHandoffUrl(element));
}

export function twoPhotonHandoffCandidates(elements = [], signalHits = [], stageId = '') {
  return twoPhotonLaserCandidates(elements, signalHits, stageId).map(laser => {
    const hits = signalHits.filter(hit => hit?.stageId === stageId && hit.sourceId === laser.id);
    const allHaveNA = hits.length > 0 && hits.every(hit => finite(hit.objectiveNA));
    const nas = new Set(hits.filter(hit => finite(hit.objectiveNA)).map(hit => hit.objectiveNA));
    return {
      laser,
      numericalAperture: allHaveNA && nas.size === 1 ? [...nas][0] : null,
    };
  });
}
