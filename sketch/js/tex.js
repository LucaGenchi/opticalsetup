// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Dependency-free LaTeX math for SVG text annotations: the subset a figure
// label needs -- Greek letters and symbols, sub- and superscripts, \frac,
// \sqrt, accents, \text and a few font switches. A formula becomes a list of
// runs positioned in em relative to the pen and the line's baseline, so it
// stays plain SVG <tspan> text in the workbench and in every export. Widths
// come from the caller's estimate, never from the DOM, and every placement is
// relative to where the previous glyph actually ended. Commands outside the
// subset stay visible as typed rather than silently vanishing.

const GREEK_LOWER = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ',
  eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν',
  xi: 'ξ', pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς', tau: 'τ',
  upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
};

const GREEK_UPPER = {
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ',
  Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
};

const SYMBOLS = {
  infty: '∞', partial: '∂', nabla: '∇', hbar: 'ℏ', hslash: 'ℏ', ell: 'ℓ', Re: 'ℜ', Im: 'ℑ',
  wp: '℘', aleph: 'ℵ', emptyset: '∅', varnothing: '∅', forall: '∀', exists: '∃', nexists: '∄',
  neg: '¬', lnot: '¬', angle: '∠', measuredangle: '∡', degree: '°', prime: '′', dagger: '†',
  ddagger: '‡', ldots: '…', dots: '…', cdots: '⋯', vdots: '⋮', ddots: '⋱', AA: 'Å',
  triangle: '△', square: '□', top: '⊤', bot: '⊥', vert: '|', Vert: '‖', '|': '‖',
  $: '$', '%': '%', '#': '#', '&': '&', _: '_',
};

const BINARY = {
  pm: '±', mp: '∓', times: '×', cdot: '⋅', div: '÷', ast: '∗', star: '⋆', circ: '∘',
  bullet: '∙', oplus: '⊕', ominus: '⊖', otimes: '⊗', odot: '⊙', cup: '∪', cap: '∩',
  wedge: '∧', land: '∧', vee: '∨', lor: '∨', setminus: '∖',
};

const RELATIONS = {
  leq: '≤', le: '≤', geq: '≥', ge: '≥', leqslant: '⩽', geqslant: '⩾', neq: '≠', ne: '≠',
  approx: '≈', sim: '∼', simeq: '≃', cong: '≅', equiv: '≡', propto: '∝', ll: '≪', gg: '≫',
  doteq: '≐', coloneqq: '≔', triangleq: '≜', asymp: '≍', to: '→', rightarrow: '→',
  leftarrow: '←', gets: '←', leftrightarrow: '↔', Rightarrow: '⇒', Leftarrow: '⇐',
  Leftrightarrow: '⇔', longrightarrow: '⟶', longleftarrow: '⟵', Longrightarrow: '⟹',
  implies: '⟹', iff: '⟺', mapsto: '↦', rightleftharpoons: '⇌', uparrow: '↑',
  downarrow: '↓', in: '∈', notin: '∉', ni: '∋', subset: '⊂', supset: '⊃', subseteq: '⊆',
  supseteq: '⊇', perp: '⊥', parallel: '∥', mid: '∣',
};

const LARGE_OPERATORS = {
  sum: '∑', prod: '∏', coprod: '∐', int: '∫', iint: '∬', iiint: '∭', oint: '∮',
  bigcup: '⋃', bigcap: '⋂', bigoplus: '⨁', bigotimes: '⨂',
};

const OPENING = { langle: '⟨', lfloor: '⌊', lceil: '⌈', lbrace: '{', '{': '{', lvert: '|', lVert: '‖' };
const CLOSING = { rangle: '⟩', rfloor: '⌋', rceil: '⌉', rbrace: '}', '}': '}', rvert: '|', rVert: '‖' };

const table = (cls, entries, extra = {}) =>
  Object.entries(entries).map(([name, text]) => [name, { cls, text, ...extra }]);

const COMMANDS = Object.fromEntries([
  ...table('ord', GREEK_LOWER, { italic: true }),
  ...table('ord', GREEK_UPPER),
  ...table('ord', SYMBOLS),
  ...table('bin', BINARY),
  ...table('rel', RELATIONS),
  ...table('op', LARGE_OPERATORS),
  ...table('open', OPENING),
  ...table('close', CLOSING),
]);

// A symbol typed directly (± or ≤ from a keyboard or a paste) spaces like its
// command would.
const CHAR_CLASS = new Map([
  ...Object.values(BINARY).map(text => [text, 'bin']),
  ...Object.values(RELATIONS).map(text => [text, 'rel']),
  ...Object.values(LARGE_OPERATORS).map(text => [text, 'op']),
]);

const FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh',
  'tanh', 'coth', 'exp', 'log', 'ln', 'lg', 'lim', 'liminf', 'limsup', 'max', 'min', 'sup',
  'inf', 'arg', 'det', 'dim', 'ker', 'deg', 'gcd', 'hom', 'Pr',
]);

const ACCENTS = {
  hat: '̂', widehat: '̂', check: '̌', tilde: '̃', widetilde: '̃',
  acute: '́', grave: '̀', dot: '̇', ddot: '̈', breve: '̆',
  bar: '̄', vec: '⃗', mathring: '̊',
};

// Explicit spacing commands, in eighteenths of an em as TeX counts them.
const SPACES = {
  ',': 3, thinspace: 3, ':': 4, '>': 4, medspace: 4, ';': 5, thickspace: 5, '!': -3,
  negthinspace: -3, ' ': 6, enspace: 9, quad: 18, qquad: 36,
};

const STYLES = {
  mathrm: { italic: false }, mathup: { italic: false }, mathsf: { italic: false },
  mathtt: { italic: false }, mathit: { italic: true }, mathbf: { bold: true, italic: false },
  boldsymbol: { bold: true }, bm: { bold: true },
};

const TEXT_COMMANDS = {
  text: {}, textrm: {}, textnormal: {}, textup: {}, mbox: {},
  textit: { italic: true }, textbf: { bold: true },
};

const DOUBLE_STRUCK = { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' };

// Sizing commands only matter to TeX's own delimiter growth, which this
// subset does not do; the delimiter that follows is drawn at its normal size.
const IGNORED = new Set([
  'displaystyle', 'textstyle', 'scriptstyle', 'limits', 'nolimits', 'nonumber', 'notag',
  'big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr', 'Bigl', 'Bigr', 'biggl', 'biggr', 'Biggl',
  'Biggr', 'bigm', 'Bigm', '\\',
]);

// Vertical metrics in em of the run's own size: cap height, descender, and
// the math axis (the height of a minus sign) that fraction bars sit on.
const ASCENT = 0.72;
const DESCENT = 0.22;
const AXIS = 0.25;
const SCRIPT_SCALE = 0.7;
const FRACTION_SCALE = 0.75;
const SMALLEST_SCALE = 0.5;
const FRACTION_BAR = '—';

const THIN = 3 / 18;
const MEDIUM = 4 / 18;
const THICK = 5 / 18;

// TeX's inter-atom spacing (The TeXbook, chapter 18), rows the left atom and
// columns the right one, in CLASSES order. 1 is a thin space everywhere; t, m
// and k are thin, medium and thick spaces that vanish inside scripts and
// script-size fractions; 0 is none (or a pairing TeX never produces).
const CLASSES = ['ord', 'op', 'bin', 'rel', 'open', 'close', 'punct'];
const SPACING = {
  ord: '01mk000',
  op: '110k000',
  bin: 'mm00m00',
  rel: 'kk00k00',
  open: '0000000',
  close: '01mk000',
  punct: 'tt0tttt',
};

function interAtomSpace(left, right, script) {
  if (!left) return 0;
  const code = SPACING[left][CLASSES.indexOf(right)];
  if (code === '1') return THIN;
  if (script) return 0;
  return { t: THIN, m: MEDIUM, k: THICK }[code] || 0;
}

// ---------------------------------------------------------------- parsing

const sym = (cls, text, extra = {}) => ({ type: 'sym', cls, text, italic: false, ...extra });

// Every way into a deeper level -- a {group}, a script, a \frac or \sqrt
// argument, a \left delimiter -- passes through parseList or parseAtom, so
// counting their nesting bounds the parse, and with it the layout that walks
// the parsed tree. No real formula comes near the limit (about twenty
// nested groups); a deeper one would overflow the stack.
const MAX_DEPTH = 40;

class TooDeep extends Error {}

function descend(state) {
  if (++state.depth > MAX_DEPTH) throw new TooDeep();
}

function readChar(state) {
  const character = String.fromCodePoint(state.src.codePointAt(state.i));
  state.i += character.length;
  return character;
}

function skipSpaces(state) {
  while (state.i < state.src.length && /\s/.test(state.src[state.i])) state.i++;
}

function charNode(character) {
  if (/[A-Za-zα-ω]/.test(character)) return sym('ord', character, { italic: true });
  if (character === '-') return sym('bin', '−');
  if (character === '+') return sym('bin', '+');
  if (character === '*') return sym('bin', '∗');
  if ('=<>:'.includes(character)) return sym('rel', character);
  if (',;'.includes(character)) return sym('punct', character);
  if ('(['.includes(character)) return sym('open', character);
  if (')]!?'.includes(character)) return sym('close', character);
  if (character === "'") return sym('ord', '′');
  return sym(CHAR_CLASS.get(character) || 'ord', character);
}

// The raw text of a {group}, for \text and friends: no math inside, spaces kept.
function readRawGroup(state) {
  skipSpaces(state);
  if (state.i >= state.src.length) return '';
  if (state.src[state.i] !== '{') return readChar(state);
  let depth = 0;
  const start = ++state.i;
  while (state.i < state.src.length) {
    const character = state.src[state.i];
    if (character === '\\') state.i++;
    else if (character === '{') depth++;
    else if (character === '}' && depth-- === 0) return state.src.slice(start, state.i++);
    state.i++;
  }
  return state.src.slice(start);
}

function parseArgument(state) {
  skipSpaces(state);
  if (state.i >= state.src.length) return [];
  if (state.src[state.i] === '{') {
    state.i++;
    return parseList(state, '}');
  }
  const node = parseAtom(state);
  return node ? [node] : [];
}

function parseDelimiter(state, cls) {
  skipSpaces(state);
  if (state.i >= state.src.length) return null;
  if (state.src[state.i] === '.') {
    state.i++;
    return null;
  }
  const node = parseAtom(state);
  return node && node.type === 'sym' ? { ...node, cls, italic: false } : node;
}

function parseCommand(state) {
  if (state.i >= state.src.length) return sym('ord', '\\');
  const word = /^[A-Za-z]+/.exec(state.src.slice(state.i));
  const name = word ? word[0] : readChar(state);
  if (word) state.i += name.length;

  if (name in SPACES) return { type: 'space', em: SPACES[name] / 18 };
  if (IGNORED.has(name)) return null;
  if (COMMANDS[name]) return sym(COMMANDS[name].cls, COMMANDS[name].text, { italic: !!COMMANDS[name].italic });
  if (FUNCTIONS.has(name)) return sym('op', name);
  if (name === 'frac' || name === 'dfrac' || name === 'tfrac' || name === 'cfrac') {
    const display = name === 'dfrac' ? true : name === 'tfrac' ? false : undefined;
    return { type: 'frac', num: parseArgument(state), den: parseArgument(state), display };
  }
  if (name === 'sqrt') {
    skipSpaces(state);
    let index = null;
    if (state.src[state.i] === '[') {
      state.i++;
      index = parseList(state, ']');
    }
    return { type: 'sqrt', index, body: parseArgument(state) };
  }
  if (ACCENTS[name]) return { type: 'accent', mark: ACCENTS[name], body: parseArgument(state) };
  if (name === 'overline' || name === 'underline') {
    return { type: 'decor', decoration: name, body: parseArgument(state) };
  }
  if (STYLES[name]) return { type: 'style', ...STYLES[name], body: parseArgument(state) };
  if (TEXT_COMMANDS[name]) {
    return sym('ord', readRawGroup(state), { font: 'text', ...TEXT_COMMANDS[name] });
  }
  if (name === 'operatorname') {
    if (state.src[state.i] === '*') state.i++;
    return sym('op', readRawGroup(state));
  }
  if (name === 'mathbb') {
    const letters = [...readRawGroup(state)].map(letter => DOUBLE_STRUCK[letter]
      || (/[A-Z]/.test(letter) ? String.fromCodePoint(0x1d538 + letter.charCodeAt(0) - 65) : letter));
    return sym('ord', letters.join(''));
  }
  if (name === 'left') return parseDelimiter(state, 'open');
  if (name === 'right') return parseDelimiter(state, 'close');
  if (name === 'middle') return parseDelimiter(state, 'rel');
  return sym('ord', `\\${name}`, { font: 'text' });
}

function parseAtom(state) {
  descend(state);
  const node = readAtom(state);
  state.depth--;
  return node;
}

function readAtom(state) {
  const character = readChar(state);
  if (/\s/.test(character) || character === '&') return null;
  if (character === '{') return { type: 'group', body: parseList(state, '}') };
  if (character === '}') return sym('ord', '}');
  if (character === '\\') return parseCommand(state);
  if (character === '~') return { type: 'space', em: SPACES[' '] / 18 };
  return charNode(character);
}

function parseList(state, closer) {
  descend(state);
  const nodes = [];
  while (state.i < state.src.length) {
    const character = state.src[state.i];
    if (character === closer) {
      state.i++;
      break;
    }
    if (character === '^' || character === '_') {
      state.i++;
      const key = character === '^' ? 'sup' : 'sub';
      let target = nodes[nodes.length - 1];
      if (!target || target.type === 'space' || target[key]) {
        target = { type: 'group', body: [] };
        nodes.push(target);
      }
      target[key] = parseArgument(state);
      continue;
    }
    const node = parseAtom(state);
    if (node) nodes.push(node);
  }
  state.depth--;
  return nodes;
}

// ---------------------------------------------------------------- layout

const emptyBox = () => ({ runs: [], width: 0, top: 0, bottom: 0 });

function pushRun(box, run, measure) {
  box.runs.push(run);
  box.width += measure(run);
  box.top = Math.min(box.top, run.shift - ASCENT * run.scale);
  box.bottom = Math.max(box.bottom, run.shift + DESCENT * run.scale);
}

function pushGap(box, em) {
  if (!em) return;
  box.runs.push({ text: '', dx: em, shift: 0, scale: 1 });
  box.width += em;
}

function appendBox(box, other, shift = 0) {
  for (const run of other.runs) box.runs.push({ ...run, shift: run.shift + shift });
  box.width += other.width;
  if (other.runs.some(run => run.text)) {
    box.top = Math.min(box.top, other.top + shift);
    box.bottom = Math.max(box.bottom, other.bottom + shift);
  }
}

function atomClass(node) {
  return node.type === 'sym' ? node.cls : 'ord';
}

function nextClass(nodes, index) {
  const next = nodes.slice(index + 1).find(node => node.type !== 'space');
  return next ? atomClass(next) : null;
}

function layoutList(nodes, ctx, measure) {
  const box = emptyBox();
  let previous = null;
  nodes.forEach((node, index) => {
    if (node.type === 'space') {
      pushGap(box, node.em * ctx.scale);
      return;
    }
    let cls = atomClass(node);
    // A binary operator with nothing to combine on one side is a sign: the
    // minus of -x, or a + standing alone in a subscript.
    if (cls === 'bin' && (!previous || ['bin', 'op', 'rel', 'open', 'punct'].includes(previous)
      || [null, 'rel', 'close', 'punct'].includes(nextClass(nodes, index)))) cls = 'ord';
    pushGap(box, interAtomSpace(previous, cls, ctx.script) * ctx.scale);
    appendBox(box, layoutAtom(node, ctx, measure));
    previous = cls;
  });
  return box;
}

function layoutAtom(node, ctx, measure) {
  const box = layoutNucleus(node, ctx, measure);
  if (!node.sup && !node.sub) return box;
  const scriptCtx = { ...ctx, scale: Math.max(SMALLEST_SCALE, ctx.scale * SCRIPT_SCALE), script: true, display: false };
  const sup = node.sup && layoutList(node.sup, scriptCtx, measure);
  const sub = node.sub && layoutList(node.sub, scriptCtx, measure);
  const s = ctx.scale;
  // A tall nucleus (a fraction, or a group that already carries a script)
  // pushes its scripts out to its own top and bottom.
  const supShift = Math.min(-0.4 * s, box.top + 0.32 * s);
  const subShift = Math.max((sup ? 0.26 : 0.16) * s, box.bottom - 0.04 * s);
  if (sup && sub) {
    appendBox(box, sup, supShift);
    pushGap(box, -sup.width);
    appendBox(box, sub, subShift);
    pushGap(box, Math.max(0, sup.width - sub.width));
  } else if (sup) {
    appendBox(box, sup, supShift);
  } else {
    appendBox(box, sub, subShift);
  }
  return box;
}

function layoutNucleus(node, ctx, measure) {
  const box = emptyBox();
  switch (node.type) {
    case 'sym': {
      if (!node.text) return box;
      pushRun(box, {
        text: node.text,
        italic: ctx.italic ?? node.italic,
        bold: !!(ctx.bold || node.bold),
        font: node.font || 'math',
        scale: ctx.scale,
        shift: 0,
      }, measure);
      return box;
    }
    case 'group':
      return layoutList(node.body, ctx, measure);
    case 'style':
      return layoutList(node.body, {
        ...ctx,
        italic: node.italic ?? ctx.italic,
        bold: node.bold ?? ctx.bold,
      }, measure);
    case 'frac':
      return layoutFraction(node, ctx, measure);
    case 'sqrt':
      return layoutRoot(node, ctx, measure);
    case 'accent': {
      const body = layoutList(node.body, ctx, measure);
      const last = body.runs.findLast(run => run.text);
      if (last) last.text += node.mark;
      return body;
    }
    case 'decor': {
      const body = layoutList(node.body, ctx, measure);
      for (const run of body.runs) if (run.text) run.decoration = node.decoration;
      return body;
    }
    default:
      return box;
  }
}

// Numerator, denominator, then the bar, each placed relative to where the
// previous one ended: the bar is a dash stretched to the fraction's width
// with textLength, so no part of the fraction needs an absolute x.
function layoutFraction(node, ctx, measure) {
  const display = node.display ?? ctx.display;
  const partCtx = display && !ctx.script
    ? { ...ctx, display: false }
    : { ...ctx, display: false, script: true, scale: Math.max(SMALLEST_SCALE, ctx.scale * FRACTION_SCALE) };
  const num = layoutList(node.num, partCtx, measure);
  const den = layoutList(node.den, partCtx, measure);
  const s = ctx.scale;
  const axis = -AXIS * s;
  const gap = 0.12 * s;
  const width = Math.max(num.width, den.width) + 0.16 * s;
  const box = emptyBox();
  pushGap(box, (width - num.width) / 2);
  appendBox(box, num, axis - gap - num.bottom);
  pushGap(box, -(num.width + den.width) / 2);
  appendBox(box, den, axis + gap - den.top);
  pushGap(box, -(width + den.width) / 2);
  pushRun(box, { text: FRACTION_BAR, stretch: width, italic: false, font: 'math', scale: s, shift: 0 }, measure);
  return box;
}

function layoutRoot(node, ctx, measure) {
  const s = ctx.scale;
  const box = emptyBox();
  if (node.index) {
    const index = layoutList(node.index, { ...ctx, display: false, script: true, scale: Math.max(SMALLEST_SCALE, s * 0.6) }, measure);
    appendBox(box, index, -0.45 * s);
    pushGap(box, -Math.min(index.width, 0.3 * s));
  }
  pushRun(box, { text: '√', italic: false, font: 'math', scale: s, shift: 0 }, measure);
  const body = layoutList(node.body, ctx, measure);
  for (const run of body.runs) if (run.text) run.decoration = 'overline';
  appendBox(box, body);
  return box;
}

// Runs for one formula. `measure(run)` returns a run's advance in em of the
// line's font size (its own scale included). Each returned run carries:
// text, italic, bold, font ('math' or 'text'), scale, shift (em below the
// baseline, negative is up), dx (em of pen movement before it), and
// optionally stretch (em width to fit with textLength) and decoration. A
// trailing run with empty text carries a pen movement still owed to whatever
// follows the formula. Neighbours that differ in nothing but their text
// (the digits of 22, the letters of nL) come back as one run. A formula that
// nests deeper than MAX_DEPTH returns null, for the caller to show as typed.
const sameStyle = (a, b) => ['italic', 'bold', 'font', 'scale', 'shift', 'decoration']
  .every(key => a[key] === b[key]) && !a.stretch && !b.stretch;

export function texRuns(source, { display = false, measure = () => 0.55 } = {}) {
  const state = { src: String(source ?? ''), i: 0, depth: 0 };
  let nodes;
  try {
    nodes = parseList(state, null);
  } catch (error) {
    if (error instanceof TooDeep) return null;
    throw error;
  }
  const box = layoutList(nodes, { scale: 1, display, script: false }, measure);
  const runs = [];
  let dx = 0;
  for (const run of box.runs) {
    dx += run.dx || 0;
    if (!run.text) continue;
    const previous = runs[runs.length - 1];
    if (previous && !dx && sameStyle(previous, run)) previous.text += run.text;
    else runs.push({ ...run, dx });
    dx = 0;
  }
  if (dx) runs.push({ text: '', dx, shift: 0, scale: 1 });
  return runs;
}
