#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Measure how much each reference's numerics move when refined.

    python3 validation/convergence.py            # write validation/expected/convergence.json
    python3 validation/convergence.py --check    # exit 1 if that file is out of date

A tolerance should sit well above how much a reference's own result moves
when its discretisation is refined, and that has to be measured rather than
asserted. This script refines some of the settings the references depend on
and records the observed change. The report quotes these numbers.

What a row is: the change in one quantity between two listed settings. It is
evidence of sensitivity at those settings, not a bound on the total numerical
error -- two settings cannot show a convergence regime, and a joint change
cannot separate the effect of each setting or rule out cancellation.

What is studied, one setting at a time unless noted: the finite-difference
step (Sellmeier GVD, argon refractivity), the Fourier window and, separately,
the grid for the time-bandwidth products. The hollow-core rows change the
grid and the step count together. Not studied: the pulse-stretching and
autocorrelation widths, and the envelope solver's time window.
"""

import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REFERENCE = os.path.join(ROOT, "validation", "reference")
OUT = os.path.join(ROOT, "validation", "expected", "convergence.json")
sys.path.insert(0, REFERENCE)

import common  # noqa: E402
import nlse  # noqa: E402
import pulse  # noqa: E402
import sellmeier  # noqa: E402
from argon_capillary import argon_refractivity  # noqa: E402

C_M_PER_S = common.C_M_PER_S


def rel(a, b):
    scale = max(abs(a), abs(b), 1e-300)
    return abs(a - b) / scale


def entry(quantity, setting, refined, a, b):
    return {
        "quantity": quantity,
        "setting": setting,
        "refined": refined,
        "value": common.sig(a),
        "refinedValue": common.sig(b),
        "relativeChange": float(f"{rel(a, b):.3g}"),
    }


def gvd_with_step(glass, nm, h):
    lam_um = nm / 1000
    d2n = common.second_derivative(lambda l: sellmeier.index(glass, l), lam_um, h) * 1e12
    lam_m = nm * 1e-9
    return lam_m ** 3 / (2 * math.pi * C_M_PER_S ** 2) * d2n * 1e30 / 1e3


def refractivity_derivative(nm, h):
    return common.second_derivative(lambda l: argon_refractivity(l, 1.0), nm / 1000, h)


def tbp_with_window(shape, window_factor, samples):
    """The time-bandwidth product on a different window and grid."""
    saved = pulse.N
    pulse.N = samples
    try:
        tau = 100.0
        return pulse.spectrum_fwhm_thz(shape, tau, window_factor * tau) * tau
    finally:
        pulse.N = saved


def nlse_case(samples, steps):
    saved = nlse.SAMPLES
    nlse.SAMPLES = samples
    try:
        field, dt, b = nlse.propagate(100.0, 30e-6, 1.0, 28.37, 7.79e-9, 0.615, 0, steps)
        metrics = nlse.metrics(field, dt)
        compressed = nlse.metrics(nlse.apply_quadratic_phase(field, dt, -650), dt)
        return metrics["fwhmFs"], compressed["fwhmFs"], metrics["spectralRmsTHz"], b
    finally:
        nlse.SAMPLES = saved


def study():
    out = []
    # Finite-difference step for the Sellmeier derivatives.
    for glass, nm in (("nbk7", 800), ("nbk7", 1550), ("silica", 800)):
        out.append(entry(
            f"GVD of {glass} at {nm} nm", "h = 1e-4 um", "h = 5e-5 um",
            gvd_with_step(glass, nm, 1e-4), gvd_with_step(glass, nm, 5e-5)))
    # And for argon's refractivity, which is differentiated on n - 1.
    for nm in (800, 1500):
        out.append(entry(
            f"argon d2(n-1)/dl2 at {nm} nm", "h = 1e-3 um", "h = 5e-4 um",
            refractivity_derivative(nm, 1e-3), refractivity_derivative(nm, 5e-4)))
    # Fourier window and grid for the pulse constants.
    for shape in ("gauss", "sech2"):
        base = tbp_with_window(shape, 64, 1 << 14)
        out.append(entry(
            f"{shape} time-bandwidth product", "window 64 tau, 16384 points",
            "window 128 tau, 16384 points", base, tbp_with_window(shape, 128, 1 << 14)))
        out.append(entry(
            f"{shape} time-bandwidth product", "window 64 tau, 16384 points",
            "window 64 tau, 32768 points", base, tbp_with_window(shape, 64, 1 << 15)))
    # Grid and step count for the split-step solver, on the bundled example.
    coarse = nlse_case(2048, 384)
    fine = nlse_case(4096, 768)
    for label, index in (("output FWHM", 0), ("compressed FWHM", 1), ("spectral RMS", 2), ("B-integral", 3)):
        out.append(entry(
            f"hollow-core example: {label}", "2048 points, 384 steps",
            "4096 points, 768 steps", coarse[index], fine[index]))
    return {"note": "Each row is the observed change in one quantity between two listed settings; the hollow-core rows change grid and step count together. Sensitivity evidence, not an error bound.", "studies": out}


# A change below this is round-off, and its digits differ between Python
# builds and platforms: the report prints it as "below 1e-9" and the check
# treats any two such values as equal.
ROUNDOFF = 1e-9


def same_study(expected, actual):
    """Whether a recorded study still describes the references.

    Compared with tolerances rather than byte for byte: the values agree to
    1e-9 relative, and each observed change either stays at round-off level
    on both sides or agrees to 10 %. A byte comparison failed on the hosted
    runner over the last digit of a 1e-13 change.
    """
    key = lambda s: (s["quantity"], s["setting"], s["refined"])
    want = {key(s): s for s in expected.get("studies", [])}
    got = {key(s): s for s in actual.get("studies", [])}
    if want.keys() != got.keys():
        return False
    for k, a in want.items():
        b = got[k]
        for field in ("value", "refinedValue"):
            scale = max(abs(a[field]), abs(b[field]), 1e-300)
            if abs(a[field] - b[field]) > 1e-9 * scale:
                return False
        ra, rb = a["relativeChange"], b["relativeChange"]
        if ra < ROUNDOFF and rb < ROUNDOFF:
            continue
        if abs(ra - rb) > 0.1 * max(ra, rb):
            return False
    return True


def main():
    check = "--check" in sys.argv
    result = study()
    text = json.dumps(result, indent=1, sort_keys=True) + "\n"
    current = open(OUT).read() if os.path.exists(OUT) else None
    if current == text:
        print("convergence study is current")
        return
    if check and current is not None:
        try:
            if same_study(json.loads(current), result):
                print("convergence study is current (within tolerance)")
                return
        except (ValueError, KeyError):
            pass
    if check:
        print(f"stale: {os.path.relpath(OUT, ROOT)}", file=sys.stderr)
        sys.exit(1)
    with open(OUT, "w") as handle:
        handle.write(text)
    print(f"wrote {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
