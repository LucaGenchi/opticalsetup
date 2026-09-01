// Acousto-optic tunable filter: the selected lines and how they are driven.
//
// A real AOTF is driven by RF tones. One tone selects one optical wavelength;
// several tones at once select several, each with its own amplitude. That is
// the model here — a list of channels, either all passing together (static,
// the multi-tone case) or taking turns (cycling, the time-multiplexed case).

export const MAX_AOTF_CHANNELS = 16;

export const AOTF_WL_MIN = 150;
export const AOTF_WL_MAX = 8000;
export const AOTF_BAND_MIN = 0.1;
export const AOTF_BAND_MAX = 2000;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const finite = v => Number.isFinite(v);

export const AOTF_BAND_DEFAULT = 2;

export function normalizeAotfChannel(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  return {
    wl: clamp(finite(+c.wl) ? +c.wl : 532, AOTF_WL_MIN, AOTF_WL_MAX),
    eff: clamp(finite(+c.eff) ? +c.eff : 0.8, 0, 1),
  };
}

// The passband is a property of the crystal and its interaction length, not
// of the RF tone applied to it, so every channel on one device shares it.
export const normalizeAotfPassband = raw =>
  clamp(finite(+raw) ? +raw : AOTF_BAND_DEFAULT, AOTF_BAND_MIN, AOTF_BAND_MAX);

// Sketches written before the passband became a device property carried one
// width per channel. Recover the device's width from what they recorded:
// the widths were almost always equal, and the widest is the safest reading
// when they are not, since it is the only one guaranteed to still pass every
// line the author had selected.
export function legacyAotfPassband(rawChannels, rawBand) {
  const widths = (Array.isArray(rawChannels) ? rawChannels : [])
    .map(c => +(c || {}).band)
    .filter(finite);
  if (finite(+rawBand)) widths.push(+rawBand);
  return widths.length ? normalizeAotfPassband(Math.max(...widths)) : AOTF_BAND_DEFAULT;
}

export function normalizeAotfChannels(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = list.slice(0, MAX_AOTF_CHANNELS).map(normalizeAotfChannel);
  // An AOTF with no tone applied is not a filter at all, it is a window.
  // Keeping one channel means the element always has something to describe.
  return out.length ? out : [normalizeAotfChannel(null)];
}

export const newAotfChannel = () => normalizeAotfChannel({ wl: 633, eff: 0.8 });

// Passband of one channel, as [lo, hi] in nm: the width at which it is half
// open. This is the number the user sets and the number the UI reports; the
// transmission below is what the tracer actually applies.
export const aotfChannelBand = (c, passband) => {
  const width = normalizeAotfPassband(passband);
  return [c.wl - width / 2, c.wl + width / 2];
};

// An acousto-optic passband is not a rectangle. The crystal diffracts light
// into the selected order only where the acoustic and optical waves stay
// phase matched along the interaction length, and the efficiency of that
// mismatch is a sinc squared: a strong central lobe, true zeros either side
// of it, and a series of decaying sidelobes. That sidelobe structure is
// characteristic of the device and is what limits how well an AOTF rejects a
// line sitting close to the one it is tuned to.
//
// sinc(x) = sin(pi x)/(pi x) falls to half power at x = 0.442946, so scaling
// the detuning by SINC_HALF/(passband/2) makes the configured passband the
// full width at half maximum. Zeros then land every 1.129 passbands.
const SINC_HALF = 0.44294647068945237;

// Cut at the third zero. sinc squared never reaches zero for good, but it
// does touch it at every zero crossing, so truncating exactly there ends the
// passband continuously instead of stepping it off a sidelobe -- and a
// channel whose wings ran on forever would overlap every other channel on
// the device, leaving the spectrometer to summarise all of them as one band.
const SINC_ZEROS_KEPT = 3;
export const aotfWingHalfWidth = passband =>
  SINC_ZEROS_KEPT / SINC_HALF * normalizeAotfPassband(passband) / 2;

// T(wavelength) -> 0..1 for one open channel, peaking at 1 on line centre.
export function aotfChannelTransmission(c, passband) {
  const width = normalizeAotfPassband(passband);
  const scale = SINC_HALF / (width / 2);
  const cutoff = aotfWingHalfWidth(width);
  return wl => {
    const detune = wl - c.wl;
    if (Math.abs(detune) > cutoff) return 0;
    const x = detune * scale;
    if (Math.abs(x) < 1e-9) return 1;
    const s = Math.sin(Math.PI * x) / (Math.PI * x);
    return s * s;
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
  const width = normalizeAotfPassband(params.passband);
  const lines = channels.map(c => `${c.wl.toFixed(0)} nm`).join(', ');
  const drive = params.modMode === 'cycle' && channels.length > 1
    ? `sequential at ${params.modFreqHz ?? 1000} Hz`
    : 'multiplexed';
  return `${channels.length} line${channels.length === 1 ? '' : 's'} — ${lines}`
    + ` · ${width} nm FWHM · ${drive}`;
}
