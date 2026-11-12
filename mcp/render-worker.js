// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeScene, inspectDocument, emptyDocument } from './scene-api.js';
import { state } from '../sketch/js/state.js';
import { buildSVG } from '../sketch/js/export.js';
const chunks = []; let bytes = 0;
for await (const chunk of process.stdin) { bytes += chunk.length; if (bytes > 1000000) process.exit(1); chunks.push(chunk); }
const { kind, scene: input } = JSON.parse(Buffer.concat(chunks).toString());
const scene = normalizeScene(input);
if (kind === 'inspect') process.stdout.write(JSON.stringify(inspectDocument({ ...emptyDocument(), scene })));
else if (kind === 'screenshot') {
  state.elements = scene.elements; state.beams = scene.beams;
  let svg = buildSVG({ whiteBg: true });
  if (/<(?:script|foreignObject)|(?:href|src)\s*=|url\(\s*['"]?(?:https?:|file:)/i.test(svg)) throw new Error('Unexpected external SVG content');
  const bounds = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  const scale = Math.min(1024 / bounds[2], 768 / bounds[3]);
  const width = Math.max(1, Math.round(bounds[2] * scale)), height = Math.max(1, Math.round(bounds[3] * scale));
  // Resize before rasterization so authored coordinates never allocate a giant image.
  svg = svg.replace(/(<svg\b[^>]*\b)width="\d+" height="\d+"/, `$1width="${width}" height="${height}"`);
  if (!process.env.MEMORY_DIR) throw new Error('Memory renderer is unavailable');
  const svgPath = join(process.env.MEMORY_DIR, 'scene.svg');
  await writeFile(svgPath, svg, { mode: 0o600 });
  const png = await new Promise((resolve, reject) => {
    const child = spawn(process.env.FFMPEG || '/usr/bin/ffmpeg', ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', svgPath, '-frames:v', '1', '-threads', '1', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1'], { stdio: ['pipe', 'pipe', 'ignore'] });
    const output = []; let size = 0;
    const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
    child.on('error', reject); child.stdin.on('error', () => {});
    child.stdout.on('data', data => { size += data.length; if (size > 900000) child.kill('SIGKILL'); else output.push(data); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(Buffer.concat(output)) : reject(new Error('PNG render failed')); });
    child.stdin.end();
  });
  if (!png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('Invalid PNG');
  process.stdout.write(JSON.stringify({ data: png.toString('base64'), width, height }));
} else throw new Error('Unknown computation');
