"""Transform-limited pulses, quadratic-phase stretching and autocorrelation.

Reference: direct numerical Fourier propagation of Gaussian and sech^2
envelopes. The time-bandwidth constants, the Gaussian stretching formula,
the sech^2 stretching table and the autocorrelation-to-FWHM factors the app
uses are all *derived* here from the envelopes themselves, so the check is
against first principles rather than against the same constants copied
twice.
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
        "J.-C. Diels and W. Rudolph, Ultrashort Laser Pulse Phenomena, 2nd ed., ch. 1 (time-bandwidth products, autocorrelation factors)",
        "G. P. Agrawal, Nonlinear Fiber Optics, ch. 3 (Gaussian pulse broadening under GVD)",
    ],
    "fidelity": "computed",
    "scope": "Transform-limited input, second-order spectral phase only; no third-order dispersion or amplitude reshaping.",
}
