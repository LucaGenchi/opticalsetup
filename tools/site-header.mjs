// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The brand bar every generated section page shares (wiki, examples,
// calculators, community): the section links, About, the light/dark switch
// and "Open the canvas". wiki/assets/site-header.js wires the About dialog
// and the switch; the switch stores the same choice the app's does, so the
// canvas and these pages keep one appearance.
//
// The About text follows the app's About dialog (sketch/index.html); the
// homepage (index.html) carries a hand-written copy of this header and
// dialog. If the citation changes, change it in the app, here, in both places
// on the homepage (About and #cite) and in CITATION.cff;
// test/site-header.test.js checks the three dialogs agree.

const brandMark = () => `
  <svg class="brand-mark" viewBox="0 0 130 85" aria-hidden="true">
    <g class="mark-accent" stroke-width="4" stroke-linecap="round">
      <line x1="22" y1="45" x2="29" y2="45"/>
      <line x1="20.8" y1="47.8" x2="25.8" y2="52.8"/>
      <line x1="18" y1="49" x2="18" y2="56"/>
      <line x1="15.2" y1="47.8" x2="10.2" y2="52.8"/>
      <line x1="14" y1="45" x2="7" y2="45"/>
      <line x1="15.2" y1="42.2" x2="10.2" y2="37.2"/>
      <line x1="18" y1="41" x2="18" y2="34"/>
      <line x1="20.8" y1="42.2" x2="25.8" y2="37.2"/>
    </g>
    <line class="mark-accent" x1="29" y1="45" x2="77" y2="45" stroke-width="4" stroke-linecap="round"/>
    <polygon class="mark-ink" points="64,12 42,68 86,68" fill="none" stroke-width="4.5" stroke-linejoin="round"/>
    <g class="mark-accent" stroke-width="2.4" stroke-linecap="round">
      <line x1="77" y1="45" x2="108" y2="22"/>
      <line x1="77" y1="45" x2="108" y2="34"/>
      <line x1="77" y1="45" x2="108" y2="45"/>
      <line x1="77" y1="45" x2="108" y2="56"/>
      <line x1="77" y1="45" x2="108" y2="68"/>
    </g>
    <line class="mark-ink" x1="108" y1="14" x2="108" y2="76" stroke-width="4" stroke-linecap="round"/>
    <g class="mark-ink" stroke-width="3" stroke-linecap="round">
      <line x1="108" y1="22" x2="115" y2="22"/>
      <line x1="108" y1="34" x2="115" y2="34"/>
      <line x1="108" y1="45" x2="115" y2="45"/>
      <line x1="108" y1="56" x2="115" y2="56"/>
      <line x1="108" y1="68" x2="115" y2="68"/>
    </g>
  </svg>`;

// Runs in <head> before the stylesheets, as the app's own boot script does,
// so a page opens in the stored or system appearance without a flash.
export const themeBootScript = `<script>
  (() => {
    let savedTheme = null;
    try { savedTheme = localStorage.getItem('opticalsetup-theme'); } catch (_) { /* storage may be unavailable */ }
    const systemTheme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = savedTheme === 'dark' || savedTheme === 'light'
      ? savedTheme
      : systemTheme;
  })();
</script>`;

const SECTIONS = [
  ['wiki', 'Wiki'],
  ['example-setups', 'Examples'],
  ['calculators', 'Calculators'],
  ['community', 'Community'],
];

function aboutDialog(base) {
  return `
  <dialog id="aboutDialog" class="site-dialog" aria-labelledby="aboutTitle">
    <div class="site-dialog-head">
      <div><span class="eyebrow">Free software</span><h2 id="aboutTitle">About OpticalSetup</h2></div>
      <button type="button" id="aboutClose" class="site-dialog-close" aria-label="Close about dialog">×</button>
    </div>
    <p class="about-text" id="aboutVersion" hidden></p>
    <p class="about-text">Copyright © 2026 Luca Genchi and contributors.</p>
    <p class="about-text">OpticalSetup is free software: you can redistribute it and/or modify it
      under the terms of the GNU General Public License as published by the Free Software
      Foundation, either version 3 of the License, or (at your option) any later version.</p>
    <p class="about-text">It is distributed in the hope that it will be useful, but
      <strong>without any warranty</strong>; without even the implied warranty of merchantability
      or fitness for a particular purpose. See the GNU General Public License for more details.</p>
    <p class="about-text">The numbers OpticalSetup reports come from models with stated limits; read
      each component's page in the <a href="${base}/wiki/">wiki</a> before relying on one.</p>
    <p class="about-text">If you use OpticalSetup in your research, teaching or publications,
      please cite the software:</p>
    <p class="about-text about-citation">Bertoncini, A., &amp; Genchi, L. (2026).
      <cite>OpticalSetup - the optical workbench software</cite> [Computer software]. Zenodo.
      <a href="https://doi.org/10.5281/zenodo.23191537" target="_blank" rel="noopener">https://doi.org/10.5281/zenodo.23191537</a></p>
    <p class="about-links">
      <a href="${base}/#cite">BibTeX and version DOIs</a>
      <a href="${base}/license.html">License and notices</a>
      <a href="https://github.com/LucaGenchi/opticalsetup" target="_blank" rel="noopener">Source code</a>
    </p>
  </dialog>`;
}

// `current` names the section the page belongs to (a SECTIONS key), marked
// with aria-current; `base` is the relative path to the site root.
export function siteHeader(base, { current = null } = {}) {
  const links = SECTIONS.map(([path, label]) =>
    `      <a class="plain" href="${base}/${path}/"${path === current ? ' aria-current="page"' : ''}>${label}</a>`).join('\n');
  return `
  <header class="site-header">
    <a class="brand" href="${base}/">${brandMark()}<span class="brand-ink">Optical</span><span class="brand-accent">Setup</span></a>
    <div class="header-actions">
${links}
      <button type="button" id="btnAbout" class="plain" aria-haspopup="dialog" title="License, copyright and citation">About</button>
      <button type="button" id="btnTheme" class="theme-toggle" aria-pressed="false" aria-label="Switch to dark mode" title="Switch to dark mode">
        <svg class="theme-icon theme-icon-moon" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M15.7 12.7A6.5 6.5 0 0 1 7.3 4.3a6.5 6.5 0 1 0 8.4 8.4Z"/>
        </svg>
        <svg class="theme-icon theme-icon-sun" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="3.2"/>
          <path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4 4l1.4 1.4M14.6 14.6 16 16M16 4l-1.4 1.4M5.4 14.6 4 16"/>
        </svg>
      </button>
      <a class="btn" href="${base}/sketch/">Open the canvas</a>
    </div>
  </header>${aboutDialog(base)}
  <script type="module" src="${base}/wiki/assets/site-header.js"></script>`;
}
