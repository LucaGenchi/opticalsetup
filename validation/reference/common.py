# SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Shared numerics for the reference implementations.

Everything here is deliberately plain Python (no numpy) so that the
references run on any machine and in CI without an install step. Speed is
not the point; independence from the JavaScript is.
"""

import cmath
import math

C_M_PER_S = 299792458.0
C_NM_PER_FS = 299.792458


def fft(x, inverse=False):
    """Iterative radix-2 complex FFT. Forward uses exp(-i 2 pi k n / N)."""
    n = len(x)
    if n & (n - 1):
        raise ValueError("length must be a power of two")
    a = list(x)
    j = 0
    for i in range(1, n):
        bit = n >> 1
        while j & bit:
            j ^= bit
            bit >>= 1
        j ^= bit
        if i < j:
            a[i], a[j] = a[j], a[i]
    size = 2
    sign = 1.0 if inverse else -1.0
    while size <= n:
        w = cmath.exp(sign * 2j * math.pi / size)
        half = size // 2
        for start in range(0, n, size):
            wk = 1.0 + 0j
            for k in range(half):
                u = a[start + k]
                v = a[start + k + half] * wk
                a[start + k] = u + v
                a[start + k + half] = u - v
                wk *= w
        size *= 2
    if inverse:
        a = [v / n for v in a]
    return a


def second_derivative(f, x, h):
    """Five-point central second derivative."""
    return (-f(x + 2 * h) + 16 * f(x + h) - 30 * f(x) + 16 * f(x - h) - f(x - 2 * h)) / (12 * h * h)


def first_derivative(f, x, h):
    """Five-point central first derivative."""
    return (-f(x + 2 * h) + 8 * f(x + h) - 8 * f(x - h) + f(x - 2 * h)) / (12 * h)


def fwhm(values, dx):
    """Full width at half maximum between the outermost half-maximum
    crossings, with linear interpolation, the same definition the app uses."""
    peak = max(values)
    first = next(i for i, v in enumerate(values) if v >= peak / 2)
    last = len(values) - 1
    while last > first and values[last] < peak / 2:
        last -= 1
    left = first - (values[first] - peak / 2) / (values[first] - values[first - 1]) if first > 0 else first
    right = last + (values[last] - peak / 2) / (values[last] - values[last + 1]) if last < len(values) - 1 else last
    return (right - left) * dx


def rms_width(values, dx):
    total = sum(values)
    mean = sum(i * v for i, v in enumerate(values)) / total
    return math.sqrt(sum((i - mean) ** 2 * v for i, v in enumerate(values)) / total) * dx


def sig(x, digits=10):
    """Round to significant digits so the expected files are stable."""
    if x is None or x == 0 or not math.isfinite(x):
        return x
    return float(f"{x:.{digits}g}")
