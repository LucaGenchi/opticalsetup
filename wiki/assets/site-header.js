// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The shared brand bar of the wiki, examples, calculators and community pages
// (markup from tools/site-header.mjs): the About dialog and the light/dark
// switch. The switch is the app's own, so a choice made here carries to the
// canvas, and to the canvas embedded in the page.
import { initTheme } from '../../sketch/js/theme.js';
import { APP_RELEASE } from '../../sketch/js/release.js';

initTheme(document.getElementById('btnTheme'));

const about = document.getElementById('aboutDialog');
const version = document.getElementById('aboutVersion');
if (version && APP_RELEASE) {
  version.textContent = `Version ${APP_RELEASE}.`;
  version.hidden = false;
}
document.getElementById('btnAbout')?.addEventListener('click', () => about?.showModal());
document.getElementById('aboutClose')?.addEventListener('click', () => about?.close());
// A click on the backdrop or on a link closes it: on the homepage "BibTeX and
// version DOIs" scrolls to #cite under the dialog.
about?.addEventListener('click', event => {
  if (event.target === about || event.target.closest('a')) about.close();
});
