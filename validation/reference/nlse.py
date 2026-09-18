"""Scalar nonlinear envelope propagation (second-order dispersion, Kerr
self-phase modulation, distributed loss).

Reference: an independent symmetric split-step Fourier implementation in
Agrawal's convention, run on a finer grid (2048 samples, at least 256
steps) than the app's solver (sketch/js/pulse-field.js, 1024 samples, about
32 steps per unit of B-integral). Agreement therefore also demonstrates
that the app's discretisation is converged for the bundled hollow-core
example, and that its sign conventions (which chirp self-phase modulation
imposes, which sign of GDD compresses it) match the textbook ones.

Convention (Agrawal, Nonlinear Fiber Optics): E = A(z, T) exp(-i w0 t),
A~(w) = int A(T) exp(+i w T) dT, dA/dz = -(i beta2 / 2) d2A/dT2 + i gamma |A|^2 A
- (alpha / 2) A. In the frequency domain the linear step multiplies by
exp(+i beta2 w^2 h / 2).
"""

import math

from common import fft, fwhm, rms_width, sig

SAMPLES = 2048


def gaussian_field(pulse_width_fs, energy_j, dt_fs):
    shape = math.sqrt(math.pi / (4 * math.log(2)))
    peak_power = energy_j / (pulse_width_fs * 1e-15 * shape)
    return [
        math.sqrt(peak_power) * math.exp(-2 * math.log(2) * ((i - SAMPLES / 2) * dt_fs / pulse_width_fs) ** 2) + 0j
        for i in range(SAMPLES)
    ], peak_power


def apply_quadratic_phase(field, dt_fs, gdd_fs2):
    """Multiply the exp(+i w T) transform by exp(+i GDD w^2 / 2)."""
    if not gdd_fs2:
        return field
    # A~(w) with the exp(+i w T) kernel is the inverse FFT up to scale.
    spec = fft(field, inverse=True)
    n = len(field)
    for i in range(n):
        w = 2 * math.pi * (i if i < n / 2 else i - n) / (n * dt_fs)
        phi = gdd_fs2 * w * w / 2
        spec[i] *= complex(math.cos(phi), math.sin(phi))
    return fft(spec)


def propagate(pulse_width_fs, energy_j, length_m, beta2_fs2_per_m, gamma_per_w_m,
              loss_db_per_m=0.0, input_gdd_fs2=0.0, steps=256):
    stretch = math.sqrt(1 + (4 * math.log(2) * max(abs(input_gdd_fs2 + beta2_fs2_per_m * length_m), abs(input_gdd_fs2)) / pulse_width_fs ** 2) ** 2)
    window_fs = 24 * pulse_width_fs * max(1.0, stretch)
    dt = window_fs / SAMPLES
    field, peak_power = gaussian_field(pulse_width_fs, energy_j, dt)
    field = apply_quadratic_phase(field, dt, input_gdd_fs2)
    alpha = loss_db_per_m * math.log(10) / 10
    dz = length_m / steps
    b_integral = 0.0
    for _ in range(steps):
        field = apply_quadratic_phase(field, dt, beta2_fs2_per_m * dz / 2)
        peak = 0.0
        for i in range(SAMPLES):
            a = field[i] * math.exp(-alpha * dz / 4)
            p = abs(a) ** 2
            peak = max(peak, p)
            field[i] = a * complex(math.cos(gamma_per_w_m * p * dz), math.sin(gamma_per_w_m * p * dz)) * math.exp(-alpha * dz / 4)
        b_integral += gamma_per_w_m * peak * dz
        field = apply_quadratic_phase(field, dt, beta2_fs2_per_m * dz / 2)
    return field, dt, b_integral


def metrics(field, dt):
    intensity = [abs(v) ** 2 for v in field]
    energy = sum(intensity) * dt * 1e-15
    spec = fft(field)
    power = [abs(v) ** 2 for v in spec]
    power = power[SAMPLES // 2:] + power[: SAMPLES // 2]
    return {
        "fwhmFs": fwhm(intensity, dt),
        "rmsFs": rms_width(intensity, dt),
        "peakPowerW": max(intensity),
        "energyJ": energy,
        "spectralRmsTHz": rms_width(power, 1 / (SAMPLES * dt)) * 1000,
    }


BASE = {"pulseWidthFs": 100, "energyJ": 30e-6, "lengthM": 1}


def case(name, params, compress_fs2=None, steps=256, tolerance=None):
    field, dt, b = propagate(params["pulseWidthFs"], params["energyJ"], params["lengthM"],
                             params.get("beta2Fs2PerM", 0), params.get("gammaPerWM", 0),
                             params.get("lossDbPerM", 0), params.get("inputGddFs2", 0), steps)
    m = metrics(field, dt)
    expected = {"fwhmFs": m["fwhmFs"], "rmsFs": m["rmsFs"], "energyJ": m["energyJ"],
                "spectralRmsTHz": m["spectralRmsTHz"], "bIntegral": b}
    if compress_fs2 is not None:
        compressed = apply_quadratic_phase(field, dt, compress_fs2)
        expected["compressedFwhmFs"] = metrics(compressed, dt)["fwhmFs"]
    inputs = dict(params)
    if compress_fs2 is not None:
        inputs["compressorGddFs2"] = compress_fs2
    return {
        "name": name,
        "inputs": inputs,
        "expected": {k: sig(v) for k, v in expected.items()},
        "tolerance": tolerance or {"fwhmFs": 5e-3, "rmsFs": 5e-3, "energyJ": 1e-6,
                                   "spectralRmsTHz": 5e-3, "bIntegral": 1e-2, "compressedFwhmFs": 1e-2},
    }


def cases():
    return [
        case("linear: 2000 fs^2/m and 3 dB/m", {**BASE, "wavelengthNm": 800, "beta2Fs2PerM": 2000, "lossDbPerM": 3}, steps=64),
        case("pure self-phase modulation, gamma 7e-9", {**BASE, "wavelengthNm": 800, "gammaPerWM": 7e-9}),
        case("chirped input -3000 fs^2 through 2000 fs^2/m, no Kerr",
             {**BASE, "wavelengthNm": 800, "beta2Fs2PerM": 2000, "inputGddFs2": -3000}, steps=64),
        case("bundled hollow-core example (250 um, 2 bar, 0.615 dB/m) then -650 fs^2",
             {**BASE, "wavelengthNm": 800, "beta2Fs2PerM": 28.37, "gammaPerWM": 7.79e-9, "lossDbPerM": 0.615},
             compress_fs2=-650, steps=384),
        case("stronger case: 60 uJ, 3 bar equivalent then -900 fs^2",
             {**BASE, "energyJ": 60e-6, "wavelengthNm": 800, "beta2Fs2PerM": 42.5, "gammaPerWM": 1.17e-8, "lossDbPerM": 0.615},
             compress_fs2=-900, steps=512),
    ]


MODEL = {
    "id": "nlse",
    "title": "Scalar envelope propagation: GDD, Kerr SPM and loss (hollow-core solver)",
    "app": "sketch/js/pulse-field.js: propagateEnvelope, fieldMetrics",
    "reference": "Independent symmetric split-step Fourier solver in Agrawal's convention on a 2048-point grid with 4-8x more steps",
    "citations": [
        "G. P. Agrawal, Nonlinear Fiber Optics, 5th ed., sections 2.3 and 4.1 (NLSE, SPM broadening)",
    ],
    "fidelity": "computed",
    "scope": "Single mode, scalar, instantaneous Kerr response, second-order dispersion only; no Raman, self-steepening, ionisation or mode coupling.",
}
