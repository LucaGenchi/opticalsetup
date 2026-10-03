# SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Transform-limited pulses, quadratic-phase stretching and autocorrelation.

Reference: direct numerical Fourier propagation of Gaussian and sech^2
envelopes. The time-bandwidth constants, the Gaussian stretching formula,
the sech^2 stretching table and the autocorrelation-to-FWHM factors the app
uses are all *derived* here from the envelopes themselves, so the check is
against first principles rather than against the same constants copied
twice.

The published values these derivations reproduce are 0.4413 and 0.3148 for
the time-bandwidth products and 1.5427 for the sech^2 autocorrelation ratio
(Diels and Rudolph, Table 1.1); the app ships 0.441, 0.315 and 1.543, which
is where the 1e-3 tolerances come from -- the app's own rounding, not a
disagreement about the physics.
"""

import math

from common import C_NM_PER_FS, fft, fwhm, sig

N = 1 << 14


def envelope(shape, t, tau_fwhm):
    if shape == "gauss":
        return math.exp(-2 * math.log(2) * (t / tau_fwhm) ** 2)
    t0 = tau_fwhm / (2 * math.log(1 + math.sqrt(2)))
    return 1 / math.cosh(t / t0)


def spectrum_fwhm_thz(shape, tau_fwhm, window):
    dt = window / N
    field = [envelope(shape, (i - N / 2) * dt, tau_fwhm) + 0j for i in range(N)]
    spec = fft(field)
    power = [abs(v) ** 2 for v in spec]
    power = power[N // 2:] + power[: N // 2]
    return fwhm(power, 1 / window)  # frequency resolution 1/window (per fs)


def time_bandwidth_product(shape):
    tau = 100.0
    return spectrum_fwhm_thz(shape, tau, 64 * tau) * tau


def stretched_fwhm(shape, tau_fwhm, gdd_fs2, window_factor=48):
    """Propagate a transform-limited envelope through quadratic spectral
    phase exp(i GDD w^2 / 2) and measure the intensity FWHM."""
    window = window_factor * tau_fwhm * max(1.0, abs(gdd_fs2) / tau_fwhm ** 2)
    dt = window / N
    field = [envelope(shape, (i - N / 2) * dt, tau_fwhm) + 0j for i in range(N)]
    spec = fft(field)
    for i in range(N):
        w = 2 * math.pi * (i if i < N / 2 else i - N) / window
        spec[i] *= complex(math.cos(gdd_fs2 * w * w / 2), math.sin(gdd_fs2 * w * w / 2))
    out = fft(spec, inverse=True)
    return fwhm([abs(v) ** 2 for v in out], dt)


def autocorrelation_factor(shape):
    tau = 100.0
    window = 64 * tau
    dt = window / N
    intensity = [envelope(shape, (i - N / 2) * dt, tau) ** 2 + 0j for i in range(N)]
    spec = fft(intensity)
    ac = fft([abs(v) ** 2 for v in spec], inverse=True)
    trace = [v.real for v in ac]
    trace = trace[N // 2:] + trace[: N // 2]
    return fwhm(trace, dt) / tau


def cases():
    out = []
    for shape in ("gauss", "sech2"):
        tbp = time_bandwidth_product(shape)
        out.append({
            "name": f"{shape} time-bandwidth product",
            "inputs": {"shape": shape, "pulseWidthFs": 100, "wavelengthNm": 800},
            # The app's bandwidth formula is lambda^2 K / (c tau), the small-band
            # approximation of the exact frequency width, so compare K itself.
            "expected": {"tbp": sig(tbp), "bandwidthNm": sig(800 ** 2 * tbp / (C_NM_PER_FS * 100))},
            "tolerance": {"tbp": 2e-3, "bandwidthNm": 2e-3},
        })
        out.append({
            "name": f"{shape} autocorrelation FWHM factor",
            "inputs": {"shape": shape},
            "expected": {"factor": sig(autocorrelation_factor(shape))},
            "tolerance": {"factor": 1e-3},
        })
    for q in (0.25, 0.5, 1, 2, 5, 10):
        for shape in ("gauss", "sech2"):
            tau = 100.0
            out.append({
                "name": f"{shape} 100 fs after {q} tau^2 of GDD",
                "inputs": {"shape": shape, "pulseWidthFs": tau, "gddFs2": q * tau * tau},
                "expected": {"durationFs": sig(stretched_fwhm(shape, tau, q * tau * tau))},
                "tolerance": {"durationFs": 2e-3},
            })
    return out


MODEL = {
    "id": "pulse",
    "title": "Transform limit, quadratic-phase stretching, autocorrelation factors",
    "app": "sketch/js/spectrum.js: transformLimitedBandwidthNm; sketch/js/glass.js: gaussianPulseDurationAfterGDD, sech2PulseDurationAfterGDD, AUTOCORRELATION_FACTORS",
    "reference": "Direct Fourier propagation of the analytic envelopes on a 16384-point grid",
    "citations": [
        "J.-C. Diels and W. Rudolph, Ultrashort Laser Pulse Phenomena, 2nd ed. (Academic Press, 2006), ch. 1, Table 1.1: the published time-bandwidth products 0.4413 (Gaussian) and 0.3148 (sech^2) and the intensity-autocorrelation widths, from which the deconvolution factors sqrt(2) and 1.5427 follow.",
        "G. P. Agrawal, Nonlinear Fiber Optics, 5th ed. (Academic Press, 2013), section 3.2: a Gaussian of width T0 under GDD broadens as T0 sqrt(1 + (beta2 z / T0^2)^2), the closed form the app uses.",
        "R. Trebino, Frequency-Resolved Optical Gating (Kluwer, 2000), ch. 2, for the sech^2 autocorrelation width ratio 1.543 as instruments quote it.",
    ],
    "provenance": "The constants the app ships (0.441, 0.315, sqrt(2), 1.543) are the published ones; this module does not read them back but derives each from the envelope by Fourier transform and numerical autocorrelation, so a transcription error in the app would show as disagreement.",
    "domain": "Cases run: 100 fs at 800 nm for the bandwidth conversion, and stretching from q = 0.25 to 10, i.e. GDD 2500 to 100000 fs^2 on a 100 fs pulse. The relations are dimensionless in q = GDD / T0^2, so the mathematics carries further, but the unit conversions are exercised only at these inputs.",
    "convergence": "16384-point grids over a 64-pulse-width window, for the time-bandwidth products. Refining the time grid at a fixed window changes them only at round-off level, below 1e-9. Widening the window changes them by about 1e-4 because the frequency spacing is 1/window and the spectral FWHM is interpolated between frequency bins -- not because the envelope is truncated: at +/-32 pulse widths the sech^2 field is already about 6e-25. The Gaussian shows the same frequency-grid effect. These studies cover the time-bandwidth products only; the stretching and autocorrelation widths were not refined.",
    "convergence_keys": ["time-bandwidth product"],
    "tolerance_rationale": "1e-3 to 2e-3: the derived constants agree with the published ones to about 5e-4 (0.4413 versus the app's 0.441 is already 7e-4 by rounding), and the FWHM of a sampled envelope carries the grid's own resolution. The tolerances are set by those two, not by a generic rule.",
    "outside_scope": "No range gate: `transformLimitedBandwidthNm` returns a bandwidth for any positive duration, including unphysical ones (0.1 fs at 800 nm gives 9415 nm). The pulsed laser's own controls bound what a user can author; the functions do not.",
    "fidelity": "computed",
    "scope": "Transform-limited input, second-order spectral phase only; no third-order dispersion or amplitude reshaping.",
}
