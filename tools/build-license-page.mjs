// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Builds license.html from LICENSE, so the licence is readable in a browser
// (a file with no extension is served as a download) and travels with the
// offline app. Run it whenever LICENSE changes.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const license = await readFile(join(ROOT, 'LICENSE'), 'utf-8');
const page = `<!DOCTYPE html>
<!-- SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
     SPDX-License-Identifier: GPL-3.0-or-later -->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>License — OpticalSetup</title>
<meta name="description" content="OpticalSetup is free software under the GNU General Public License, version 3 or any later version.">
<link rel="icon" href="/sketch/icons/icon.svg" type="image/svg+xml">
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 32px 20px 64px; background: #f3f5f7; color: #252b33;
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 860px; margin: 0 auto; }
  h1 { font-size: 22px; letter-spacing: -.3px; }
  p { color: #5b6472; }
  a { color: #1361fa; }
  pre { margin-top: 24px; padding: 20px; overflow-x: auto; border: 1px solid #dfe3e8; border-radius: 10px;
    background: #ffffff; color: #252b33; font-size: 12px; line-height: 1.5; white-space: pre-wrap; }
  @media (prefers-color-scheme: dark) {
    body { background: #131920; color: #e6ecf3; }
    p { color: #9aa7b6; }
    pre { background: #1a212a; border-color: #2b333d; color: #e6ecf3; }
  }
</style>
</head>
<body>
<main>
  <h1>OpticalSetup license</h1>
  <p>Copyright © 2026 Luca Genchi and contributors. OpticalSetup is free software: you can
    redistribute it and/or modify it under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or (at your option) any later
    version. It is distributed without any warranty; see the license below for details.</p>
  <p><a href="/sketch/">Back to the sketch</a> · <a href="https://github.com/LucaGenchi/opticalsetup">Source code</a></p>
  <pre>${escape(license)}</pre>
</main>
</body>
</html>
`;
await writeFile(join(ROOT, 'license.html'), page, 'utf-8');
console.log('Built license.html from LICENSE');
