// Dependency-free Markdown rendering for SVG text annotations. This is a
// deliberately small, figure-oriented subset: headings, lists, quotes,
// emphasis, strong text, strike-through, inline code, links, and line breaks.
// Raw HTML is never interpreted. The same SVG is used by the workbench and
// every export path, so saved figures do not depend on foreignObject support.

import { esc, linkifyText } from './util.js';

const INLINE_TOKEN = /(\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|`([^`\n]+)`|\*([^*\n]+)\*|_([^_\n]+)_)/gi;

const styleKey = token => [token.bold, token.italic, token.strike, token.code, token.href].join('|');

function appendToken(tokens, token) {
  if (!token.text) return;
  const previous = tokens[tokens.length - 1];
  if (previous && styleKey(previous) === styleKey(token)) previous.text += token.text;
  else tokens.push(token);
}

function appendPlain(tokens, value, style = {}) {
  for (const part of linkifyText(value)) {
    appendToken(tokens, { text: part.text, href: part.href, ...style });
  }
}

export function parseInlineMarkdown(value) {
  const text = String(value ?? '');
  const tokens = [];
  let cursor = 0;
  for (const match of text.matchAll(INLINE_TOKEN)) {
    if (match.index > cursor) appendPlain(tokens, text.slice(cursor, match.index));
    if (match[2] !== undefined) {
      appendToken(tokens, { text: match[2], href: match[3] });
    } else if (match[4] !== undefined || match[5] !== undefined) {
      appendPlain(tokens, match[4] ?? match[5], { bold: true });
    } else if (match[6] !== undefined) {
      appendPlain(tokens, match[6], { strike: true });
    } else if (match[7] !== undefined) {
      appendToken(tokens, { text: match[7], code: true });
    } else {
      appendPlain(tokens, match[8] ?? match[9], { italic: true });
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length || !tokens.length) appendPlain(tokens, text.slice(cursor));
  return tokens;
}

function lineBlock(raw, baseSize) {
  const heading = raw.match(/^(#{1,3})\s+(.+)$/);
  if (heading) {
    const level = heading[1].length;
    const scale = [0, 1.5, 1.28, 1.12][level];
    return { text: heading[2], size: baseSize * scale, weight: 730, kind: 'heading' };
  }
  const unordered = raw.match(/^(\s*)[-+*]\s+(.+)$/);
  if (unordered) {
    const depth = Math.min(3, Math.floor(unordered[1].length / 2));
    return { text: unordered[2], size: baseSize, prefix: '• ', indent: depth * baseSize * 1.05, kind: 'list' };
  }
  const ordered = raw.match(/^(\s*)(\d+)[.)]\s+(.+)$/);
  if (ordered) {
    const depth = Math.min(3, Math.floor(ordered[1].length / 2));
    return { text: ordered[3], size: baseSize, prefix: `${ordered[2]}. `, indent: depth * baseSize * 1.05, kind: 'list' };
  }
  const quote = raw.match(/^>\s?(.*)$/);
  if (quote) return { text: quote[1], size: baseSize, prefix: '│ ', italic: true, opacity: 0.78, kind: 'quote' };
  return { text: raw, size: baseSize, kind: raw ? 'paragraph' : 'blank' };
}

// Advance widths in em, calibrated against the canvas font stack. `1` stays
// out of the narrow class: it is a tabular digit here, not an `i`.
function glyphWidth(character) {
  if (/\s/.test(character)) return 0.33;
  if (/[ilI'.,:;|!`]/.test(character)) return 0.29;
  if (/[MW@#%&]/.test(character)) return 0.86;
  if (/[A-Z]/.test(character)) return 0.67;
  if (/[0-9]/.test(character)) return 0.58;
  if (character.codePointAt(0) > 0x2ff) return 0.95;
  return 0.55;
}

// Monospace has one advance for every glyph, so an inline-code run must not
// be measured with the proportional table — a `code line` of narrow letters
// would otherwise come out far too short and crop in the exported figure.
const MONO_ADVANCE = 0.61;

function tokenWidth(token, size) {
  if (token.code) return [...token.text].length * size * MONO_ADVANCE;
  const units = [...token.text].reduce((sum, character) => sum + glyphWidth(character), 0);
  return units * size * (token.bold ? 1.045 : 1);
}

function tokensWidth(tokens, size) {
  return tokens.reduce((sum, token) => sum + tokenWidth(token, size), 0);
}

export function markdownLayout(value, baseSize = 14) {
  const safeSize = Number.isFinite(baseSize) ? Math.max(6, Math.min(72, baseSize)) : 14;
  const rawLines = String(value ?? '').replace(/\r\n?/g, '\n').split('\n');
  const lines = rawLines.map(raw => {
    const block = lineBlock(raw, safeSize);
    const prefix = block.prefix ? [{ text: block.prefix, bold: block.kind === 'list' }] : [];
    const tokens = [...prefix, ...parseInlineMarkdown(block.text)];
    const lineHeight = block.size * (block.kind === 'heading' ? 1.23 : 1.34);
    return {
      ...block,
      tokens,
      lineHeight,
      width: (block.indent || 0) + tokensWidth(tokens, block.size),
    };
  });
  const contentHeight = lines.reduce((sum, line) => sum + line.lineHeight, 0);
  let top = -contentHeight / 2;
  for (const line of lines) {
    line.baseline = top + line.size * 0.93;
    top += line.lineHeight;
  }
  return {
    lines,
    width: Math.max(30, ...lines.map(line => line.width)),
    height: Math.max(safeSize + 10, contentHeight + 8),
  };
}

function tokenSVG(token) {
  const decorations = [token.href ? 'underline' : '', token.strike ? 'line-through' : ''].filter(Boolean).join(' ');
  const attrs = [
    token.bold ? 'font-weight="700"' : '',
    token.italic ? 'font-style="italic"' : '',
    token.code ? 'font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"' : '',
    decorations ? `text-decoration="${decorations}"` : '',
  ].filter(Boolean).join(' ');
  const span = `<tspan${attrs ? ` ${attrs}` : ''}>${esc(token.text)}</tspan>`;
  if (!token.href) return span;
  return `<a href="${esc(token.href)}" target="_blank" rel="noopener noreferrer" data-text-link="true">${span}</a>`;
}

export function markdownTextSVG(value, { fontSize = 14, fill = '#333333' } = {}) {
  const layout = markdownLayout(value, fontSize);
  const body = layout.lines.map(line => {
    if (!line.tokens.some(token => token.text)) return '';
    const attrs = [
      `x="${line.indent || 0}"`,
      `y="${line.baseline.toFixed(2)}"`,
      'text-anchor="start"',
      `font-size="${line.size.toFixed(2)}"`,
      `fill="${esc(fill)}"`,
      line.weight ? `font-weight="${line.weight}"` : '',
      line.italic ? 'font-style="italic"' : '',
      line.opacity ? `fill-opacity="${line.opacity}"` : '',
      'xml:space="preserve"',
    ].filter(Boolean).join(' ');
    return `<text ${attrs}>${line.tokens.map(tokenSVG).join('')}</text>`;
  }).join('');
  return `<g class="markdown-label" data-markdown="true">${body}</g>`;
}
