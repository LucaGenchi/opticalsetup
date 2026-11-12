// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { spawn } from 'node:child_process';
import { access, constants, mkdtemp, rm, statfs } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SceneError } from './scene-api.js';
const TMPFS = 0x01021994, ffmpeg = () => process.env.FFMPEG || '/usr/bin/ffmpeg';
// Whether this machine can make the PNG at all: a memory-backed directory and an FFmpeg binary.
export async function canRenderScreenshots() {
  const memoryFS = await statfs('/dev/shm').catch(() => null);
  return memoryFS?.type === TMPFS && access(ffmpeg(), constants.X_OK).then(() => true, () => false);
}
let active = 0;
export async function compute(kind, scene) {
  if (active >= 2) return Promise.reject(new SceneError('Renderer is busy. Retry shortly.', 'BUSY'));
  active++;
  let directory;
  try {
    if (kind === 'screenshot') {
      const memoryFS = await statfs('/dev/shm').catch(() => null);
      if (memoryFS?.type !== TMPFS) throw new SceneError('Memory-backed rendering is unavailable', 'RENDER_UNAVAILABLE');
      directory = await mkdtemp('/dev/shm/opticalsetup-');
    }
  } catch (error) { active--; throw error; }
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('./render-worker.js', import.meta.url))], { stdio: ['pipe', 'pipe', 'ignore'], env: { PATH: process.env.PATH, FFMPEG: ffmpeg(), MEMORY_DIR: directory || '' } });
    let size = 0, done = false; const chunks = [];
    const finish = (error, data) => { if (done) return; done = true; active--; clearTimeout(timer); error ? reject(error) : resolve(data); };
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish(new SceneError('Rendering timed out. Reduce the scene complexity.', 'COMPUTE_TIMEOUT')); }, 15000);
    child.on('error', () => finish(new SceneError('Renderer unavailable', 'RENDER_UNAVAILABLE')));
    child.stdout.on('data', chunk => { size += chunk.length; if (size > 2000000) { child.kill('SIGKILL'); finish(new SceneError('Render exceeds the image limit', 'IMAGE_TOO_LARGE')); } else chunks.push(chunk); });
    child.stdin.on('error', () => {});
    child.on('close', code => {
      if (code !== 0) return finish(new SceneError('Could not render the setup. Try a smaller scene.', 'RENDER_FAILED'));
      try { finish(null, JSON.parse(Buffer.concat(chunks).toString())); } catch { finish(new SceneError('Invalid render result', 'RENDER_FAILED')); }
    });
    child.stdin.end(JSON.stringify({ kind, scene }));
  }).finally(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });
}
