# SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Second check for the lens designer's wavefront and diffraction: the Cooke
triplet of optiland-cooke-triplet.py, analysed by Optiland.

Not run by the test suite or CI (it needs Optiland and NumPy). It wrote
optiland-cooke-wavefront.json with

    python3 -m venv env && env/bin/pip install optiland==0.5.5
    env/bin/python -I optiland-cooke-wavefront.py > optiland-cooke-wavefront.json

Recorded: the OPD (waves) of 63 named rays; Noll Zernike fits of Optiland's
OPD on the app's 32-cell pupil grid; and FFTPSF / FFTMTF on a 64-sample pupil
in a 128-point FFT (Optiland's own grid: 64 points from -1 to 1 inclusive),
with the Strehl ratio Optiland reports (the PSF at the chief-ray point) and
the PSF's peak. Optiland references each wavelength's OPD to that
wavelength's own chief ray.

Optiland weights each pupil sample by its ray's intensity, which includes
the glasses' internal transmittance (0.9984 to 0.9987 across this pupil at
550 nm); the app treats glass as lossless. So each PSF entry also records
`strehl_lossless`, the same Strehl ratio from Optiland's OPD with a uniform
pupil, |sum exp(2 pi i W)|^2 / count^2.
"""
import json, os, sys
import numpy as np
from optiland.distribution import BaseDistribution
from optiland.wavefront import Wavefront
from optiland.zernike import ZernikeFit
from optiland.psf import FFTPSF
from optiland.mtf import FFTMTF



def build():
    from optiland import optic
    from optiland.materials import Material
    lens = optic.Optic()
    sk16 = Material("N-SK16", "schott"); f2 = Material("F2", "schott")
    lens.add_surface(index=0, radius=np.inf, thickness=np.inf)
    lens.add_surface(index=1, radius=22.01359, thickness=3.25896, material=sk16)
    lens.add_surface(index=2, radius=-435.76044, thickness=6.00755)
    lens.add_surface(index=3, radius=-22.21328, thickness=0.99997, material=f2)
    lens.add_surface(index=4, radius=20.29192, thickness=4.75041, is_stop=True)
    lens.add_surface(index=5, radius=79.68360, thickness=2.95208, material=sk16)
    lens.add_surface(index=6, radius=-18.39533, thickness=42.20778)
    lens.add_surface(index=7)
    lens.set_aperture(aperture_type="EPD", value=10)
    lens.set_field_type(field_type="angle")
    for y in (0, 14, 20): lens.add_field(y=y)
    lens.add_wavelength(value=0.48); lens.add_wavelength(value=0.55, is_primary=True); lens.add_wavelength(value=0.65)
    return lens


class Points(BaseDistribution):
    def __init__(self, x, y):
        self.x = np.asarray(x, dtype=float); self.y = np.asarray(y, dtype=float)

    def generate_points(self, num_points):
        pass


lens = build()
out = {"optiland": "0.5.5"}
named = [(0, 1), (0, -1), (1, 0), (0.5, 0.5), (-0.3, 0.7), (0, 0.5), (0.8, -0.4)]
rays = []
for Hy in (0.0, 0.7, 1.0):
    for w in (0.48, 0.55, 0.65):
        wf = Wavefront(lens, fields=[(0.0, Hy)], wavelengths=[w], distribution=Points([p[0] for p in named], [p[1] for p in named]))
        opd = np.asarray(wf.get_data((0.0, Hy), w).opd)
        for (px, py), v in zip(named, opd):
            rays.append({"Hy": Hy, "um": w, "Px": px, "Py": py, "opd": float(v)})
out["opd"] = rays

n = 32
c = -1 + (2 * np.arange(n) + 1) / n
PX, PY = np.meshgrid(c, c)
keep = PX ** 2 + PY ** 2 <= 1
PX, PY = PX[keep], PY[keep]
zern = []
for Hy in (0.7, 1.0):
    wf = Wavefront(lens, fields=[(0.0, Hy)], wavelengths=[0.55], distribution=Points(PX, PY))
    opd = np.asarray(wf.get_data((0.0, Hy), 0.55).opd)
    fit = ZernikeFit(PX, PY, opd, zernike_type="noll", num_terms=37)
    zern.append({"Hy": Hy, "um": 0.55, "grid": n, "noll": [float(v) for v in np.asarray(fit.coeffs)]})
out["zernike"] = zern

psf = []
for Hy in (0.0, 0.7, 1.0):
    for w in (0.48, 0.55, 0.65):
        p = FFTPSF(lens, (0.0, Hy), w, num_rays=64, grid_size=128)
        img = np.asarray(p.psf)
        opd = np.asarray(p.get_data((0.0, Hy), w).opd)
        psf.append({"Hy": Hy, "um": w, "num_rays": 64, "grid_size": 128,
                    "strehl": float(p.strehl_ratio()), "peak": float(img.max() / 100),
                    "strehl_lossless": float(abs(np.exp(2j * np.pi * opd).sum()) ** 2 / opd.size ** 2)})
out["psf"] = psf

m = FFTMTF(lens, fields=[(0.0, 0.0), (0.0, 0.7), (0.0, 1.0)], wavelength=0.55, num_rays=64, grid_size=128)
out["mtf"] = {"um": 0.55, "num_rays": 64, "grid_size": 128, "fno": float(m.FNO),
              "fields": [{"Hy": Hy, "tangential": [float(v) for v in np.asarray(t)], "sagittal": [float(v) for v in np.asarray(s)]}
                         for Hy, (t, s) in zip((0.0, 0.7, 1.0), m.mtf)]}
json.dump(out, sys.stdout, indent=1)
