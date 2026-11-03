// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Ranked search shared by the component palette, the wiki hub and the
// calculators hub. It is DOM-free: each caller describes its items as plain
// documents, and this module decides which match a query and in what order.
//
// A document is { label, id, aliases, group, description, extra }; every
// field may be a string or an array of strings, and any may be missing. The
// fields are listed from the one whose match says the most about what the
// user wants (the name they read in the list) to the one that says the least
// (parameter options, which mention lenses and glasses on half the library).
//
// Matching is word-based and forgiving about the spelling of compound names:
// "half-wave", "half wave" and "halfwave" are the same query, "len" finds a
// lens by the start of its name, and one wrong letter in a longer word
// ("dicroic") is still a match. Every query word has to match somewhere.

export const SEARCH_FIELDS = ['label', 'id', 'aliases', 'group', 'description', 'extra'];

// How well one query word matched one field, from best to worst: the whole
// name ("mirror" for Mirror, "halfwave" for half-wave), one of its words
// ("mirror" for D-shaped mirror), the start of a word ("len" for lens), the
// inside of a name ("splitter" in beamsplitter), or one letter off.
export const MATCH = Object.freeze({ whole: 5, exact: 4, prefix: 3, inside: 2, fuzzy: 1, none: 0 });

// Below these lengths a word only matches whole words or word starts: "nd"
// inside "window", or "bs" inside "absorbs", is never what the user meant.
const INSIDE_MIN = 4;
const FUZZY_MIN = 5;

// Lower case, accents and sub/superscripts folded (Pérot → perot, CaF₂ →
// caf2, χ⁽²⁾ → χ(2)), Greek kept so λ/2 stays searchable.
export function normalizeSearchText(text) {
  return String(text ?? '').normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase();
}

export function searchWords(text) {
  return normalizeSearchText(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

// One entry per name: an alias list keeps its aliases apart, so "corner cube"
// can match as a whole without "corner" and "cube" coming from two aliases.
function prepareEntry(text) {
  const words = searchWords(text);
  return { words, compact: words.join('') };
}

export function prepareSearchDocument(doc = {}) {
  const fields = {};
  for (const name of SEARCH_FIELDS) {
    const value = doc[name];
    const list = Array.isArray(value) ? value : (value == null ? [] : [value]);
    fields[name] = list.map(prepareEntry).filter(entry => entry.words.length);
  }
  return { source: doc, fields };
}

// The search document of a registry component, as the palette lists it and
// the wiki indexes it. `description` and `status` are what the caller shows
// next to the label (the detector instruments override the registry text).
export function componentSearchDocument(type, def, { description = '', status = '' } = {}) {
  const extra = [status];
  for (const param of def.params || []) {
    extra.push(param.label);
    for (const option of param.options || []) extra.push(...[option].flat());
  }
  return {
    id: type,
    label: def.label,
    aliases: def.aliases || [],
    group: [def.category, def.paletteGroup].filter(Boolean),
    description,
    extra: extra.filter(value => typeof value === 'string' && value),
  };
}

// True when the two words differ by one substitution, insertion or deletion.
function withinOneEdit(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

export function matchQuality(term, entries) {
  let best = MATCH.none;
  for (const { words, compact } of entries) {
    if (compact === term) return MATCH.whole;
    if (words.includes(term)) best = Math.max(best, MATCH.exact);
    else if (words.some(word => word.startsWith(term)) || compact.startsWith(term)) best = Math.max(best, MATCH.prefix);
    else if (term.length >= INSIDE_MIN && compact.includes(term)) best = Math.max(best, MATCH.inside);
    else if (term.length >= FUZZY_MIN && words.some(word => withinOneEdit(term, word))) best = Math.max(best, MATCH.fuzzy);
  }
  return best;
}

// The score one query word earns from one field, given how well it matched
// there. The best field wins for each word, and a document's score is the
// sum over the query's words, so this table is the whole ranking policy.
// Field weight times match quality. The name a user reads in the list leads,
// an alias sits just under it, and the parameters count least: a whole word
// there (1 × 4) stays below the start of a word in the description (2 × 3),
// so "nd" finds the ND filter before every lens whose glass lists an nd.
const FIELD_WEIGHT = { label: 10, id: 8, aliases: 7, group: 4, description: 2, extra: 1 };

export function scoreTerm(field, quality) {
  return (FIELD_WEIGHT[field] ?? 0) * quality;
}

// A query of several words that spells out one whole name or alias
// ("polarizing beamsplitter") is worth that whole match for every word, on
// top of the words' own scores. Scored word by word only, the plain
// beamsplitter would win it: its label matches "beamsplitter" whole and its
// "non-polarizing" alias matches "polarizing" -- the name the user typed
// counts for more than words that happen to recur elsewhere.
function phraseScore(doc, terms) {
  if (terms.length < 2) return 0;
  const compact = terms.join('');
  let best = 0;
  for (const field of SEARCH_FIELDS) {
    if (doc.fields[field].some(entry => entry.compact === compact)) best = Math.max(best, scoreTerm(field, MATCH.whole));
  }
  return best * terms.length;
}

// Ranks prepared documents for a query. Returns the matching ones, best
// first; equal scores keep the caller's order, so the palette's own sequence
// still decides between two equally good matches. An empty query returns [].
export function rankSearch(prepared, query) {
  const terms = searchWords(query);
  if (!terms.length) return [];
  const results = [];
  prepared.forEach((doc, index) => {
    let total = phraseScore(doc, terms);
    for (const term of terms) {
      let best = 0;
      for (const field of SEARCH_FIELDS) {
        const quality = matchQuality(term, doc.fields[field]);
        if (quality) best = Math.max(best, scoreTerm(field, quality));
      }
      if (!best) return;
      total += best;
    }
    results.push({ doc: doc.source, score: total, index });
  });
  return results.sort((a, b) => b.score - a.score || a.index - b.index);
}
