<!-- SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
     SPDX-License-Identifier: GPL-3.0-or-later -->

# Third-party notices

> The notice above covers this document's own wording. The licence texts
> reproduced below belong to their authors and are quoted here to satisfy
> those licences; they are not offered under the GPL.

OpticalSetup itself is GPL-3.0-or-later (see `LICENSE`). The files below are
other people's work, shipped with the site under their own terms, and those
terms travel with them.

## KaTeX

The wiki renders its formulas with [KaTeX](https://katex.org/). The site
ships KaTeX's stylesheet and fonts under `wiki/assets/` (`katex.min.css` and
`wiki/assets/fonts/`), and the build imports the `katex` package to render
the markup. KaTeX is MIT-licensed:

```
The MIT License (MIT)

Copyright (c) 2013-2020 Khan Academy and other contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Raman reference spectra

The coherent Raman calculator ships measured Raman spectra under
`calculators/coherent-raman/spectra/`, one JSON file per material, built by
`tools/build-raman-spectra.mjs`. They are other people's measurements, not
offered under the GPL. Each file names its source, licence and the changes
made: replicate spectra averaged, cropped, averaged into 2 cm⁻¹ bins, a
straight two-point baseline subtracted, and min–max scaled to 0–1000.

- **Solvents and reagents:** A. R. Flanagan and F. G. Glavin, "Open-source
  Raman spectra of chemical compounds for active pharmaceutical ingredient
  development", *Scientific Data* 12, 498 (2025),
  doi:10.1038/s41597-025-04848-6; data doi:10.6084/m9.figshare.27931131.
  Licensed under CC BY 4.0, https://creativecommons.org/licenses/by/4.0/.
- **Pharmaceutical excipients:** K. Bērziņš, R. E. Sales, J. E. Barnsley,
  G. Walker, S. J. Fraser-Miller and K. C. Gordon, "Low-wavenumber Raman
  spectral database of pharmaceutical excipients", *Vibrational
  Spectroscopy* 107, 103021 (2020); reference data doi:10.5281/zenodo.3614035.
  Licensed under CC BY 4.0, https://creativecommons.org/licenses/by/4.0/.
- **Minerals:** the Raman Open Database, https://solsa.crystallography.net/rod/,
  whose data are dedicated to the public domain under CC0 1.0. The files
  name each ROD entry and its contributors. Only spectra contributed to ROD
  directly are used, not the RRUFF spectra it also republishes.

## Community setups

Scenes and descriptions under `community-submissions/` are their authors'
work, published with credit under the terms recorded in each submission's
`license` field — CC BY 4.0 where the author granted it on the submission
form. See `docs/community-setup-review.md`.
