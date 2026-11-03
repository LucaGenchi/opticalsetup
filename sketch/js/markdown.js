// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Dependency-free Markdown rendering for SVG text annotations. This is a
// deliberately small, figure-oriented subset: headings, lists, quotes,
// emphasis, strong text, strike-through, inline code, links, line breaks, and
// LaTeX formulas between $ signs (tex.js). Raw HTML is never interpreted. The
// same SVG is used by the workbench and every export path, so saved figures do
// not depend on foreignObject support.

import { esc, linkifyText } from './util.js';
import { texRuns } from './tex.js';

const INLINE_TOKEN = /(\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|`([^`\n]+)`|\*([^*\n]+)\*|_([^_\n]+)_)/gi;

// A formula outranks emphasis -- `$a_1 + b_1$` is math, not italics -- but
// not a code span, so `$HOME` between backticks stays code. Code spans match
// here only so the scan steps over them.
const MATH_OR_CODE = /`[^`\n]+`|(\$\$?)((?:\\.|[^\\$\n])+?)\1/g;

// Math rides in the serif faces a LaTeX reader expects; \text{} keeps the
// label's own font.
const MATH_FONT = "'STIX Two Text', 'Times New Roman', Times, 'Cambria', serif";

const styleKey = token => [token.bold, token.italic, token.strike, token.code, token.href].join('|');

function appendToken(tokens, token) {
  if (!token.text) return;
  const previous = tokens[tokens.length - 1];
  if (previous && !previous.math && styleKey(previous) === styleKey(token)) previous.text += token.text;
  else tokens.push(token);
}

function appendPlain(tokens, value, style = {}) {
  for (const part of linkifyText(value.replace(/\\\$/g, '$'))) {
    appendToken(tokens, { text: part.text, href: part.href, ...style });
  }
}

// Whether a single-$ pair encloses a formula. `body` is the text between the
// two dollar signs; `before` and `after` are the characters just outside them
// ('' at either end of the line). Pandoc's rule: a formula hugs its dollar
// signs, an escaped \$ never opens one, and a closing $ is never followed by
// a digit. So "Costs $5 and $10" -- which labels saved before formulas
// existed may say -- stays prose, while $x$ and $\frac{1}{f}$ render.
function looksLikeMath(body, before, after) {
  return body.length > 0 && !/^\s|\s$/.test(body) && before !== '\\' && !/\d/.test(after);
}

export function parseInlineMarkdown(value) {
  const text = String(value ?? '');
  const tokens = [];
  const pattern = new RegExp(MATH_OR_CODE);
  let cursor = 0;
  let match;
  while ((match = pattern.exec(text))) {
    if (!match[1]) continue;
    const display = match[1].length === 2;
    const body = match[2];
    const accepted = display
      ? body.trim().length > 0
      : looksLikeMath(body, text[match.index - 1] ?? '', text[pattern.lastIndex] ?? '');
    if (!accepted) {
      // Not a formula: rescan from the next character, so a later $ can
      // still open one ("costs $5, see $x$").
      pattern.lastIndex = match.index + 1;
      continue;
    }
    if (match.index > cursor) parseInlineText(tokens, text.slice(cursor, match.index));
    const measure = run => tokenWidth(run, 1);
    for (const run of texRuns(body, { display, measure })) tokens.push({ ...run, math: true });
    cursor = pattern.lastIndex;
  }
  if (cursor < text.length || !tokens.length) parseInlineText(tokens, text.slice(cursor));
  return tokens;
}

function parseInlineText(tokens, text) {
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
  // A formula alone on its line is displayed: centered in the label, with
  // full-size fractions.
  if (/^\s*\$\$(?:(?!\$\$).)+\$\$\s*$/.test(raw)) return { text: raw.trim(), size: baseSize, kind: 'display' };
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

// The same, for the serif faces formulas are set in (measured against STIX
// Two Text; Times New Roman runs within a few percent). Operators carry wide
// side bearings, so = and + are wider than a letter, and a combining accent
// rides on the glyph before it.
function mathGlyphWidth(character) {
  if (/[\u0300-\u036f\u20d0-\u20ff]/.test(character)) return 0;
  if (/\s/.test(character)) return 0.25;
  if (/[ijlft∫⋅]/.test(character)) return 0.29;
  if (/[,.;:!′|]/.test(character)) return 0.26;
  if (/[()[\]{}]/.test(character)) return 0.35;
  if (/[mw]/.test(character)) return 0.76;
  if (/[MW]/.test(character)) return 0.89;
  if (/[IJ]/.test(character)) return 0.37;
  if (/[A-Z\u0391-\u03a9]/.test(character)) return 0.68;
  if (/[=+−<>±∓≠∝∼×∑∞]/.test(character)) return 0.72;
  if (/[⟵⟶⟹⟺]/.test(character)) return 1.6;
  if (/[\u2190-\u21ff]/.test(character)) return 1;
  return 0.5;
}

// Monospace has one advance for every glyph, so an inline-code run must not
// be measured with the proportional table — a `code line` of narrow letters
// would otherwise come out far too short and crop in the exported figure.
const MONO_ADVANCE = 0.61;

// A math run carries its own scale (sub- and superscripts, fraction parts),
// and a stretched fraction bar is exactly as wide as it was told to be.
function tokenWidth(token, size) {
  if (token.stretch) return token.stretch * size;
  const scaled = size * (token.scale ?? 1);
  if (token.code) return [...token.text].length * scaled * MONO_ADVANCE;
  const advance = token.font === 'math' ? mathGlyphWidth : glyphWidth;
  const units = [...token.text].reduce((sum, character) => sum + advance(character), 0);
  return units * scaled * (token.bold ? 1.045 : 1);
}

function tokensWidth(tokens, size) {
  return tokens.reduce((sum, token) => sum + (token.dx || 0) * size + tokenWidth(token, size), 0);
}

// How far a line's raised and lowered math (a numerator, a denominator)
// reaches past the ordinary line box, in px above and below.
function mathOverhang(tokens, size, descent) {
  let top = 0, bottom = 0;
  for (const token of tokens) {
    if (!token.math || !token.text) continue;
    top = Math.min(top, token.shift - 0.72 * token.scale);
    bottom = Math.max(bottom, token.shift + 0.22 * token.scale);
  }
  return { above: Math.max(0, -top - 0.93) * size, below: Math.max(0, bottom - descent) * size };
}

export function markdownLayout(value, baseSize = 14) {
  const safeSize = Number.isFinite(baseSize) ? Math.max(6, Math.min(72, baseSize)) : 14;
  const rawLines = String(value ?? '').replace(/\r\n?/g, '\n').split('\n');
  const lines = rawLines.map(raw => {
    const block = lineBlock(raw, safeSize);
    const prefix = block.prefix ? [{ text: block.prefix, bold: block.kind === 'list' }] : [];
    const tokens = [...prefix, ...parseInlineMarkdown(block.text)];
    const spacing = block.kind === 'heading' ? 1.23 : 1.34;
    const overhang = mathOverhang(tokens, block.size, spacing - 0.93);
    return {
      ...block,
      tokens,
      lineHeight: block.size * spacing + overhang.above + overhang.below,
      headroom: overhang.above,
      width: (block.indent || 0) + tokensWidth(tokens, block.size),
    };
  });
  const width = Math.max(30, ...lines.map(line => line.width));
  for (const line of lines) {
    if (line.kind === 'display') line.indent = (width - line.width) / 2;
  }
  const contentHeight = lines.reduce((sum, line) => sum + line.lineHeight, 0);
  let top = -contentHeight / 2;
  for (const line of lines) {
    line.baseline = top + line.headroom + line.size * 0.93;
    top += line.lineHeight;
  }
  return {
    lines,
    width,
    height: Math.max(safeSize + 10, contentHeight + 8),
  };
}

const offset = value => (Math.abs(value) < 0.005 ? '' : value.toFixed(2));

// `dx` and `dy` are px moves from where the previous glyph left the pen; only
// math runs make them.
function tokenSVG(token, size, dx = 0, dy = 0) {
  const decorations = [token.href ? 'underline' : '', token.strike ? 'line-through' : '', token.decoration ?? ''].filter(Boolean).join(' ');
  const attrs = [
    offset(dx) ? `dx="${offset(dx)}"` : '',
    offset(dy) ? `dy="${offset(dy)}"` : '',
    token.scale && token.scale !== 1 ? `font-size="${(size * token.scale).toFixed(2)}"` : '',
    token.bold ? 'font-weight="700"' : '',
    token.italic ? 'font-style="italic"' : token.math ? 'font-style="normal"' : '',
    token.code ? 'font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"' : '',
    token.stretch ? `textLength="${(token.stretch * size).toFixed(2)}" lengthAdjust="spacingAndGlyphs"` : '',
    decorations ? `text-decoration="${decorations}"` : '',
  ].filter(Boolean).join(' ');
  const span = `<tspan${attrs ? ` ${attrs}` : ''}>${esc(token.text)}</tspan>`;
  if (!token.href) return span;
  return `<a href="${esc(token.href)}" target="_blank" rel="noopener noreferrer" data-text-link="true">${span}</a>`;
}

// A dy shift persists along a <text>, so each run moves by the difference
// from the one before, and the first run after a formula comes back down to
// the baseline. A gap a formula still owes (a dx with no glyph of its own)
// moves the next run instead. Consecutive math-font runs share one wrapping
// <tspan> for the font, which leaves their own dx/dy untouched.
function lineTokensSVG(line) {
  let shift = 0;
  let dx = 0;
  let inMath = false;
  let out = '';
  for (const token of line.tokens) {
    dx += token.dx || 0;
    if (!token.text) continue;
    const mathFont = token.font === 'math';
    if (mathFont !== inMath) out += mathFont ? `<tspan font-family="${MATH_FONT}">` : '</tspan>';
    inMath = mathFont;
    const next = token.shift || 0;
    out += tokenSVG(token, line.size, dx * line.size, (next - shift) * line.size);
    shift = next;
    dx = 0;
  }
  return inMath ? `${out}</tspan>` : out;
}

export function markdownTextSVG(value, { fontSize = 14, fill = '#333333' } = {}) {
  const layout = markdownLayout(value, fontSize);
  const body = layout.lines.map(line => {
    if (!line.tokens.some(token => token.text)) return '';
    const attrs = [
      `x="${+(line.indent || 0).toFixed(2)}"`,
      `y="${line.baseline.toFixed(2)}"`,
      'text-anchor="start"',
      `font-size="${line.size.toFixed(2)}"`,
      `fill="${esc(fill)}"`,
      line.weight ? `font-weight="${line.weight}"` : '',
      line.italic ? 'font-style="italic"' : '',
      line.opacity ? `fill-opacity="${line.opacity}"` : '',
      'xml:space="preserve"',
    ].filter(Boolean).join(' ');
    return `<text ${attrs}>${lineTokensSVG(line)}</text>`;
  }).join('');
  return `<g class="markdown-label" data-markdown="true">${body}</g>`;
}
