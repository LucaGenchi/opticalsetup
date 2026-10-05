// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The public release this copy of the app belongs to, as vMAJOR.MINOR.PATCH.
// Empty means no release has been cut. `node tools/release.mjs prepare`
// writes this line together with the matching entry in releases.json; do not
// edit it by hand. It is separate from the scene JSON `version` in state.js,
// which describes the saved-data format.
export const APP_RELEASE = 'v1.0.0';

// 'v1.2.3' -> 'v1.2'. A patch release publishes content only (a community
// setup, a wiki page, an example), so the app that draws a scene is named by
// MAJOR.MINOR, and that is the copy kept at /v1.2/sketch/.
export function releasePath(release = APP_RELEASE) {
  const match = /^v(\d+)\.(\d+)\.\d+$/.exec(release);
  return match ? `v${match[1]}.${match[2]}` : '';
}

// The kept release a page under /v1.2/sketch/ belongs to, or '' for the
// current app at /sketch/.
export function archivedRelease(pathname) {
  const match = /\/(v\d+\.\d+)\/sketch\/(?:index\.html)?$/.exec(String(pathname ?? ''));
  return match ? match[1] : '';
}
