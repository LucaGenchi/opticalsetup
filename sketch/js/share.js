// Self-contained share links. Scene data lives in the URL fragment, so it is
// never sent to the static host and no server-side storage is required.

const SHARE_PREFIX = '#sketch=';
const MAX_SHARE_HASH_CHARS = 200_000;
const MAX_SCENE_BYTES = 1_000_000;
const TOO_LARGE_TO_SHARE =
  'This setup is too large to share as a link \u2014 save it as a .json file instead.';

function bytesToBase64Url(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Share link contains invalid characters');
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function transform(bytes, Transformer, format) {
  const stream = new Blob([bytes]).stream().pipeThrough(new Transformer(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeSharePayload(text, { compression = true } = {}) {
  const canonical = JSON.stringify(JSON.parse(text));
  const source = new TextEncoder().encode(canonical);
  // Both size guards on this path report the same thing to the person
  // sharing -- this setup cannot travel in a URL -- so they say it the
  // same way. One measures the scene, the other the finished fragment.
  if (source.length > MAX_SCENE_BYTES) {
    throw new Error(TOO_LARGE_TO_SHARE);
  }

  if (compression && typeof CompressionStream === 'function') {
    try {
      const compressed = await transform(source, CompressionStream, 'gzip');
      if (compressed.length < source.length) return `g.${bytesToBase64Url(compressed)}`;
    } catch (_) { /* fall back to uncompressed JSON */ }
  }
  return `j.${bytesToBase64Url(source)}`;
}

export async function decodeSharePayload(payload) {
  const separator = payload.indexOf('.');
  if (separator !== 1) throw new Error('Unsupported share-link format');
  const encoding = payload[0];
  let bytes = base64UrlToBytes(payload.slice(2));

  if (encoding === 'g') {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('This browser cannot open compressed share links');
    }
    try {
      bytes = await transform(bytes, DecompressionStream, 'gzip');
    } catch (_) {
      throw new Error('Share link is damaged or incomplete');
    }
  } else if (encoding !== 'j') {
    throw new Error('Unsupported share-link encoding');
  }

  if (bytes.length > MAX_SCENE_BYTES) throw new Error('Shared sketch is too large to open safely');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  JSON.parse(text);
  return text;
}

export async function buildShareURL(text, href = window.location.href, options) {
  const payload = await encodeSharePayload(text, options);
  const url = new URL(href);
  url.hash = `sketch=${payload}`;
  if (url.hash.length > MAX_SHARE_HASH_CHARS) {
    throw new Error(TOO_LARGE_TO_SHARE);
  }
  return url.toString();
}

export async function sharedSceneFromURL(href = window.location.href) {
  const hash = new URL(href).hash;
  if (!hash.startsWith(SHARE_PREFIX)) return null;
  if (hash.length > MAX_SHARE_HASH_CHARS) throw new Error('Share link is too large to open safely');
  return decodeSharePayload(hash.slice(SHARE_PREFIX.length));
}

// After a successful import, autosave owns subsequent edits. Keeping the
// original fragment would import the old scene again on every reload.
export function clearSharedSceneURL(href = window.location.href, navigation = window.history) {
  const url = new URL(href);
  if (!url.hash.startsWith(SHARE_PREFIX)) return;
  url.hash = '';
  navigation.replaceState(navigation.state, '', url.toString());
}

// Building a share URL is asynchronous -- the payload is gzipped -- so the
// canvas can move underneath it. Two things go wrong when it does: the link
// describes a scene the visitor is no longer looking at, and the fragment the
// caller installs holds a pre-edit snapshot that no later edit is guaranteed
// to retire, so a reload restores the older scene over the edit.
//
// Rebuild once against the settled scene. `settled` reports whether the scene
// held still long enough for the URL to describe it, so a caller can decline
// to park a stale snapshot in the address bar while someone is mid-drag.
export async function shareURLForScene(readScene, build) {
  let scene = readScene();
  let url = await build(scene);
  if (readScene() !== scene) {
    scene = readScene();
    url = await build(scene);
  }
  return { scene, url, settled: readScene() === scene };
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (_) { /* use the DOM fallback below */ }
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const copied = document.execCommand('copy');
  area.remove();
  if (!copied) throw new Error('Could not copy the link');
}
