# SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Independent reference from the field-autocorrelation identity.

Kop & Sprik (1995), RSI 66, 5459-5463, eqs. (1)-(3): integration of
spectral intensity times a delayed-copy transfer function. We integrate in
reciprocal wavelength u (1/nm), with density S(1/u)/u**2. Simpson quadrature
and direct complex-field evaluation differ from wavelength-grid quadrature.
The source conventions (wavelength-Gaussian, ±3 sigma; wavelength-flat SC)
are model assumptions, not quantities fitted to a published experiment.
Written before the app implementation; no JavaScript is called or imported.
"""
import cmath
import math


def reference(spec, terms, n):
    if spec['kind'] == 'gauss':
        sigma = spec['fwhm'] / math.sqrt(8 * math.log(2))
        lo, hi = max(1, spec['center'] - 3 * sigma), spec['center'] + 3 * sigma
        density = lambda wavelength: math.exp(-0.5 * ((wavelength - spec['center']) / sigma) ** 2)
    else:
        lo, hi = spec['lo'], spec['hi']
        density = lambda wavelength: 1
    start, end = 1 / hi, 1 / lo
    signal = norm = 0
    for i in range(n + 1):
        u = start + (end - start) * i / n
        weight = (1 if i in (0, n) else 4 if i % 2 else 2) * density(1 / u) / u ** 2
        field = sum(t['amplitude'] * cmath.exp(1j * (2 * math.pi * 1e6 * t['opdMm'] * u + t.get('phaseRad', 0))) for t in terms)
        norm += weight
        signal += weight * abs(field) ** 2
    return signal / norm


def cases():
    out = []
    for label, spec in [('Gaussian 800 nm / 8 nm', {'kind': 'gauss', 'center': 800, 'fwhm': 8}),
                        ('continuum 300-700 nm', {'kind': 'flat', 'lo': 300, 'hi': 700})]:
        for delay in [0, 0.0004, 0.002, 0.01]:
            for phase in [0, math.pi]:
                terms = [{'amplitude': 0.5, 'opdMm': 0, 'phaseRad': 0},
                         {'amplitude': 0.5, 'opdMm': delay, 'phaseRad': phase}]
                a, b = reference(spec, terms, 8192), reference(spec, terms, 16384)
                assert abs(a - b) < 1e-9, (label, delay, a, b)
                if delay == 0:
                    assert abs(b - (1 if phase == 0 else 0)) < 1e-12
                out.append({'name': f'{label}, delay {delay} mm, phase {phase:.3g}',
                            'inputs': {'spec': spec, 'terms': terms},
                            'expected': {'power': float(f'{b:.12g}')},
                            'tolerance': {'power': 1e-5}, 'absolute': True})
    return out


MODEL = {
    'id': 'broadband-interference',
    'title': 'Time-integrated broadband self-interference',
    'app': 'spectral-coherence.js: spectralFieldResult',
    'reference': 'Complex fields with Simpson quadrature in reciprocal wavelength',
    'fidelity': 'computed',
    'scope': 'Split copies of one wavelength-Gaussian or wavelength-flat source through ideal phase-known optics; time-integrated power',
    'outside_scope': 'Unresolved wavelength or path budget returns null; caller labels power-only fallback',
    'provenance': 'Kop and Sprik, RSI 66, 5459-5463 (1995), equations (1)-(3); source shape/support are explicitly stated app assumptions.',
    'domain': '800 nm / 8 nm Gaussian and 300-700 nm continuum; 0-10 micrometre optical path difference; complementary phases.',
    'convergence': '8192 and 16384 Simpson intervals in reciprocal wavelength agree within 1e-9 absolute; equal paths reproduce exactly constructive and destructive limits.',
    'tolerance_rationale': '1e-5 absolute in input-power units allows bounded wavelength quadrature and sampled-spectrum interpolation; independent reference refinement is below 1e-9.',
    'citations': ['Kop and Sprik, Phase-sensitive interferometry with ultrashort optical pulses, Rev. Sci. Instrum. 66, 5459-5463 (1995), equations (1)-(3).'],
}
