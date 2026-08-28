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

// Passband of one channel, as [lo, hi] in nm.
export const aotfChannelBand = c => [c.wl - c.band / 2, c.wl + c.band / 2];

// Channels take turns when cycling, so each is open for 1/N of the period and
// a slow detector reads that fraction of its efficiency. Static drive opens
// them all at once, which is what simultaneous RF tones really do.
export function aotfDutyOf(channels, modMode) {
  const n = Math.max(1, channels.length);
  return modMode === 'cycle' && n > 1 ? 1 / n : 1;
}

export function aotfSummary(params = {}) {
  const channels = normalizeAotfChannels(params.channels);
  const lines = channels.map(c => `${c.wl.toFixed(0)} nm`).join(', ');
  const drive = params.modMode === 'cycle' && channels.length > 1
    ? `cycling at ${params.modFreqHz ?? 1000} Hz`
    : 'all together';
  return `${channels.length} line${channels.length === 1 ? '' : 's'} — ${lines} · ${drive}`;
}
