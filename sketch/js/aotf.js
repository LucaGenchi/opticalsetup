// Acousto-optic tunable filter: the selected lines and how they are driven.
//
// A real AOTF is driven by RF tones. One tone selects one optical wavelength;
// several tones at once select several, each with its own amplitude. That is
// the model here — a list of channels, either all passing together (static,
// the multi-tone case) or taking turns (cycling, the time-multiplexed case).

export const MAX_AOTF_CHANNELS = 8;

export const AOTF_WL_MIN = 150;
export const AOTF_WL_MAX = 8000;
export const AOTF_BAND_MIN = 0.1;
export const AOTF_BAND_MAX = 2000;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const finite = v => Number.isFinite(v);

export function normalizeAotfChannel(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  return {
    wl: clamp(finite(+c.wl) ? +c.wl : 532, AOTF_WL_MIN, AOTF_WL_MAX),
    band: clamp(finite(+c.band) ? +c.band : 2, AOTF_BAND_MIN, AOTF_BAND_MAX),
    eff: clamp(finite(+c.eff) ? +c.eff : 0.8, 0, 1),
  };
}

export function normalizeAotfChannels(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = list.slice(0, MAX_AOTF_CHANNELS).map(normalizeAotfChannel);
  // An AOTF with no tone applied is not a filter at all, it is a window.
  // Keeping one channel means the element always has something to describe.
  return out.length ? out : [normalizeAotfChannel(null)];
}

export const newAotfChannel = () => normalizeAotfChannel({ wl: 633, band: 2, eff: 0.8 });

// Passband of one channel, as [lo, hi] in nm: the width at which it is half
// open. This is the number the user sets and the number the UI reports; the
// transmission below is what the tracer actually applies.
export const aotfChannelBand = c => [c.wl - c.band / 2, c.wl + c.band / 2];

// An acousto-optic passband is not a rectangle. Diffraction efficiency peaks
// where the acoustic and optical waves are phase matched and falls away
// smoothly on either side, so a channel set to 2 nm does not pass 2 nm of
// spectrum flat and nothing beyond it -- it passes its centre strongly, its
// edges at half strength, and its wings weakly. A Lorentzian is the standard
// simple stand-in for that shape, with `band` as its full width at half
// maximum.
//
// The wings are cut where transmission falls to a hundredth of the peak.
// A Lorentzian never actually reaches zero, and a channel whose passband ran
// on forever would overlap every other channel on the device -- leaving the
// spectrometer to summarise all of them as one band, which is exactly the
// smearing the separate-band handling exists to avoid. Truncating also keeps
// the transmitted power finite and the profile's support meaningful.
const WING_FLOOR = 1e-2;
export const aotfWingHalfWidth = band =>
  Math.max(1e-9, band / 2) * Math.sqrt(1 / WING_FLOOR - 1);

// T(wavelength) -> 0..1 for one open channel, peaking at 1 on line centre.
export function aotfChannelTransmission(c) {
  const halfWidth = Math.max(1e-9, c.band / 2);
  const cutoff = aotfWingHalfWidth(c.band);
  return wl => {
    const detune = wl - c.wl;
    if (Math.abs(detune) > cutoff) return 0;
    const x = detune / halfWidth;
    return 1 / (1 + x * x);
  };
}

// Sequential drive steps through the lines one at a time, so at any instant
// exactly one is open — that is what the trace shows. A real RF driver steps
// at kilohertz, far too fast to read, so the drawn cycle is slowed to a couple
// of steps a second in the same illustrative spirit as the galvo and chopper.
const MIN_STEPS_PER_S = 0.2;
const MAX_STEPS_PER_S = 2;

export function aotfActiveIndex(channels, params = {}, seconds = 0) {
  const n = Math.max(1, channels.length);
  if (params.modMode !== 'cycle' || n < 2) return null;
  const rate = Math.min(MAX_STEPS_PER_S, Math.max(MIN_STEPS_PER_S, Number(params.modFreqHz) || 1000));
  const step = Math.floor(Math.max(0, seconds) * rate);
  return ((step % n) + n) % n;
}

// The lines actually open at this instant: every one under multiplexed drive,
// exactly one under sequential drive.
export function aotfOpenChannels(params = {}, seconds = 0) {
  const channels = normalizeAotfChannels(params.channels);
  const active = aotfActiveIndex(channels, params, seconds);
  return active === null ? channels : [channels[active]];
}

export function aotfSummary(params = {}) {
  const channels = normalizeAotfChannels(params.channels);
  const lines = channels.map(c => `${c.wl.toFixed(0)} nm`).join(', ');
  const drive = params.modMode === 'cycle' && channels.length > 1
    ? `sequential at ${params.modFreqHz ?? 1000} Hz`
    : 'multiplexed';
  return `${channels.length} line${channels.length === 1 ? '' : 's'} — ${lines} · ${drive}`;
}
