# SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Second check for the lens designer: the Cooke triplet traced by Optiland.

Not run by the test suite or CI (it needs Optiland and NumPy). It wrote
optiland-cooke-triplet.json with

    python3 -m venv env && env/bin/pip install optiland==0.5.5
    env/bin/python -I optiland-cooke-triplet.py > optiland-cooke-triplet.json

The glasses are set to SCHOTT N-SK16 and F2 so that both programs use the
same Sellmeier data (Optiland resolves a bare "SK16" to the Hikari catalogue).
"""
import json, sys
import numpy as np
import optiland
from optiland import optic
from optiland.materials import Material

def cooke():
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

lens = cooke()
p = lens.paraxial
out = {"optiland": optiland.__version__ if hasattr(optiland, '__version__') else 'unknown',
       "paraxial": {k: float(np.squeeze(getattr(p, k)())) for k in ["f2", "EPL", "EPD", "XPL", "XPD", "FNO"]}}
out["paraxial"]["index"] = {str(w): [float(np.squeeze(s.material_post.n(w))) for s in lens.surface_group.surfaces] for w in (0.48, 0.55, 0.65)}
rays = []
for Hy in (0.0, 0.7, 1.0):
    for (Px, Py) in [(0, 0), (0, 1), (0, -1), (1, 0), (0.5, 0.5), (-0.3, 0.7), (0, 0.5)]:
        for w in (0.48, 0.55, 0.65):
            r = lens.trace_generic(0.0, Hy, Px, Py, w)
            rays.append({"Hy": Hy, "Px": Px, "Py": Py, "um": w,
                         **{k: float(np.squeeze(getattr(r, k))) for k in ["x", "y", "z", "L", "M", "N", "opd"]}})
out["rays"] = rays
# RMS spot on the square-cell-centre grid the app uses (n cells across the pupil diameter),
# each wavelength about the primary-wavelength centroid of its field (Optiland's definition).
n = 64
c = -1 + (2 * np.arange(n) + 1) / n
PX, PY = np.meshgrid(c, c)
keep = PX ** 2 + PY ** 2 <= 1
PX, PY = PX[keep], PY[keep]
spots = []
for Hy in (0.0, 0.7, 1.0):
    pts = {}
    for w in (0.48, 0.55, 0.65):
        r = lens.trace_generic(np.zeros_like(PX), np.full_like(PX, Hy), PX, PY, w)
        pts[w] = (np.asarray(r.x), np.asarray(r.y))
    cx, cy = pts[0.55][0].mean(), pts[0.55][1].mean()
    spots.append({"Hy": Hy, "n": n, "rays": int(PX.size),
                  "rms": {str(w): float(np.sqrt(np.mean((x - cx) ** 2 + (y - cy) ** 2))) for w, (x, y) in pts.items()},
                  "centroid_primary": [float(cx), float(cy)]})
out["spots"] = spots
# f-tan distortion at the image plane, as Optiland's Distortion analysis
# computes it: the real chief ray against a near-axis chief ray scaled by tan.
distortion = []
for Hy in (0.7, 1.0):
    lens.trace_generic(Hx=np.zeros(2), Hy=np.array([1e-10, Hy]), Px=0, Py=0, wavelength=0.55)
    yr = lens.surface_group.y[-1, :]
    yp = yr[0] / np.tan(1e-10 * np.radians(20)) * np.tan(Hy * np.radians(20))
    distortion.append({"Hy": Hy, "um": 0.55, "percent": float(100 * (yr[1] - yp) / yp)})
out["distortion"] = distortion
json.dump(out, sys.stdout, indent=1)
