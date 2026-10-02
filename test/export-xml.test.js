// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The exported figure is a standalone XML document, not HTML. The .svg
// download is opened by XML parsers -- a browser tab, Inkscape, Illustrator
// -- and the PNG and GIF exports load the same text as an image/svg+xml
// image, which renders nothing past the first error. A bare HTML-style
// attribute such as `<path data-camera-profile-fill d="...">` is harmless in
// the live DOM but fatal there: it once broke all three exports of every
// scene with a camera profile or a spectrum on a detector screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createElement, registry } from '../sketch/js/elements.js';
// Registered as main.js registers them, so every component the app offers
// is drawn below.
import '../sketch/js/detector-instruments.js';
import '../sketch/js/etalon.js';
import '../sketch/js/vipa.js';
import { buildSVG } from '../sketch/js/export.js';
import { state } from '../sketch/js/state.js';
import { sceneFiles, sceneFromFile } from '../tools/update-golden.mjs';

// A small well-formedness check, enough for markup assembled from strings:
// one root, matched tags, every attribute quoted and given once, references
// limited to the five predefined entities and character references, only
// characters XML allows, and declared namespace prefixes. It returns the
// first problem, or null. It is not a validating parser, and it rejects a
// DOCTYPE rather than read one; the export never writes one.
const NAME_START = ':A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF'
  + '\\u200C\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD';
const NAME = `[${NAME_START}][${NAME_START}\\-.0-9\\u00B7\\u0300-\\u036F\\u203F\\u2040]*`;
const START_TAG = new RegExp(`<(${NAME})`, 'y');
const END_TAG = new RegExp(`</(${NAME})[ \\t\\r\\n]*>`, 'y');
const ATTRIBUTE = new RegExp(`(${NAME})[ \\t\\r\\n]*=[ \\t\\r\\n]*(?:"([^"]*)"|'([^']*)')`, 'y');
const ATTRIBUTE_NAME = new RegExp(NAME, 'y');
const SPACE = /[ \t\r\n]*/y;
const REFERENCE = /&(?:amp|lt|gt|quot|apos|#([0-9]+)|#x([0-9a-fA-F]+));/y;
const NOT_XML_CHAR = /[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/u;

function badReference(chunk) {
  for (let at = chunk.indexOf('&'); at >= 0; at = chunk.indexOf('&', at + 1)) {
    REFERENCE.lastIndex = at;
    const match = REFERENCE.exec(chunk);
    if (!match) return chunk.slice(at, at + 10);
    if (match[1] || match[2]) {
      const code = match[1] ? Number(match[1]) : Number.parseInt(match[2], 16);
      if (!(code <= 0x10FFFF) || NOT_XML_CHAR.test(String.fromCodePoint(code))) return match[0];
    }
  }
  return null;
}

function xmlProblem(text) {
  const illegal = NOT_XML_CHAR.exec(text);
  if (illegal) {
    const code = illegal[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
    return `character U+${code} is not allowed in XML (offset ${illegal.index})`;
  }
  const open = [];
  let rootSeen = false;
  let at = 0;
  while (at < text.length) {
    const next = text.indexOf('<', at);
    const content = text.slice(at, next < 0 ? text.length : next);
    if (!open.length && /[^ \t\r\n]/.test(content)) return `text outside the root element (offset ${at})`;
    const reference = badReference(content);
    if (reference) return `"${reference}" is not an XML reference (offset ${at})`;
    if (content.includes(']]>')) return `"]]>" in text (offset ${at})`;
    if (next < 0) break;
    at = next;
    if (text.startsWith('<!--', at)) {
      const close = text.indexOf('-->', at + 4);
      if (close < 0) return `unterminated comment (offset ${at})`;
      const body = text.slice(at + 4, close);
      if (body.includes('--') || body.endsWith('-')) return `"--" inside the comment (offset ${at})`;
      at = close + 3;
    } else if (text.startsWith('<![CDATA[', at)) {
      const close = text.indexOf(']]>', at + 9);
      if (!open.length || close < 0) return `misplaced or unterminated CDATA (offset ${at})`;
      at = close + 3;
    } else if (text.startsWith('<?', at)) {
      const close = text.indexOf('?>', at + 2);
      if (close < 0) return `unterminated processing instruction (offset ${at})`;
      if (at > 0 && /^<\?xml[ \t\r\n?]/i.test(text.slice(at, at + 6))) return `XML declaration not at the start (offset ${at})`;
      at = close + 2;
    } else if (text.startsWith('<!', at)) {
      return `unsupported declaration (offset ${at})`;
    } else if (text.startsWith('</', at)) {
      END_TAG.lastIndex = at;
      const match = END_TAG.exec(text);
      if (!match) return `malformed end tag (offset ${at})`;
      const element = open.pop();
      if (element?.name !== match[1]) return `</${match[1]}> closes ${element ? `<${element.name}>` : 'nothing'} (offset ${at})`;
      at = END_TAG.lastIndex;
    } else {
      START_TAG.lastIndex = at;
      const match = START_TAG.exec(text);
      if (!match) return `malformed tag (offset ${at})`;
      const name = match[1];
      if (!open.length) {
        if (rootSeen) return `second root element <${name}> (offset ${at})`;
        rootSeen = true;
      }
      at = START_TAG.lastIndex;
      const attributes = new Map();
      let selfClosing = false;
      for (;;) {
        SPACE.lastIndex = at;
        SPACE.exec(text);
        const separated = SPACE.lastIndex > at;
        at = SPACE.lastIndex;
        if (text.startsWith('/>', at)) { selfClosing = true; at += 2; break; }
        if (text[at] === '>') { at += 1; break; }
        ATTRIBUTE.lastIndex = at;
        const attribute = ATTRIBUTE.exec(text);
        if (!attribute) {
          ATTRIBUTE_NAME.lastIndex = at;
          const bare = ATTRIBUTE_NAME.exec(text)?.[0];
          return bare
            ? `attribute ${bare} on <${name}> has no quoted value (offset ${at})`
            : `malformed <${name}> tag (offset ${at})`;
        }
        const [, key, doubleQuoted, singleQuoted] = attribute;
        const value = doubleQuoted ?? singleQuoted;
        if (!separated) return `no space before attribute ${key} on <${name}> (offset ${at})`;
        if (attributes.has(key)) return `attribute ${key} repeated on <${name}> (offset ${at})`;
        if (value.includes('<')) return `"<" in attribute ${key} on <${name}> (offset ${at})`;
        const reference = badReference(value);
        if (reference) return `"${reference}" in attribute ${key} on <${name}> is not an XML reference (offset ${at})`;
        attributes.set(key, value);
        at = ATTRIBUTE.lastIndex;
      }
      const prefixes = new Set(open.at(-1)?.prefixes ?? ['xml', 'xmlns']);
      for (const key of attributes.keys()) if (key.startsWith('xmlns:')) prefixes.add(key.slice(6));
      for (const qualified of [name, ...attributes.keys()]) {
        const parts = qualified.split(':');
        if (parts.length > 2 || parts.includes('')) return `malformed qualified name ${qualified}`;
        if (parts.length === 2 && !prefixes.has(parts[0])) return `namespace prefix ${parts[0]} of ${qualified} is not declared`;
      }
      if (!selfClosing) open.push({ name, prefixes });
    }
  }
  if (open.length) return `<${open.at(-1).name}> is never closed`;
  return rootSeen ? null : 'no root element';
}

function exported(elements, beams = [], options) {
  state.elements = elements;
  state.beams = beams;
  return buildSVG(options);
}

test('the XML check accepts well-formed markup and names what is wrong with malformed markup', () => {
  const wellFormed = '<?xml version="1.0" encoding="UTF-8"?>\n<!-- figure -->\n'
    + '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10">'
    + '<g data-camera-profile-fill="1" data-note=\'say "hi"\'><title>A &amp; B &lt;5 mW&gt; &#8722;1 &#x3bb; →</title></g>'
    + '<use xlink:href="#a" /><text><![CDATA[a < b & c]]></text><g ></g ></svg>\n';
  assert.equal(xmlProblem(wellFormed), null);

  const malformed = {
    'valueless attribute': ['<svg><path data-camera-profile-fill d="M 0,0"/></svg>',
      /attribute data-camera-profile-fill on <path> has no quoted value/],
    'unquoted value': ['<svg><g opacity=1/></svg>', /attribute opacity on <g> has no quoted value/],
    'repeated attribute': ['<svg><g a="1" a="2"/></svg>', /attribute a repeated on <g>/],
    'attributes run together': ['<svg><g a="1"b="2"/></svg>', /no space before attribute b/],
    'bare ampersand': ['<svg><text>A & B</text></svg>', /"& B" is not an XML reference/],
    'HTML entity': ['<svg><text>&nbsp;</text></svg>', /"&nbsp;" is not an XML reference/],
    'less-than in a value': ['<svg><g aria-label="a<b"/></svg>', /"<" in attribute aria-label/],
    'ampersand in a value': ['<svg><a href="?a=1&b=2"/></svg>', /in attribute href on <a> is not an XML reference/],
    'mismatched end tag': ['<svg><g></svg>', /<\/svg> closes <g>/],
    'unclosed root': ['<svg><g/>', /<svg> is never closed/],
    'two roots': ['<svg/><svg/>', /second root element/],
    'text outside the root': ['<svg/>caption', /text outside the root element/],
    'undeclared prefix': ['<svg><use xlink:href="#a"/></svg>', /namespace prefix xlink of xlink:href is not declared/],
    'control character': ['<svg><text>\u0008</text></svg>', /U\+0008 is not allowed/],
    'reference to a forbidden character': ['<svg><text>&#0;</text></svg>', /"&#0;" is not an XML reference/],
    'double hyphen in a comment': ['<svg><!-- a -- b --></svg>', /"--" inside the comment/],
    'nothing at all': ['', /no root element/],
  };
  for (const [what, [markup, expected]] of Object.entries(malformed)) {
    assert.match(xmlProblem(markup) ?? 'accepted', expected, what);
  }
});

test('a detector screen showing a camera profile or a spectrum exports as well-formed XML', () => {
  const laser = createElement('cwlaser', 0, 0);
  const camera = createElement('camera', 300, 0);
  const profile = createElement('display', 420, 80);
  profile.params.sensorId = camera.id;
  const spectrum = createElement('display', 420, -80);
  spectrum.params.sensorId = camera.id;
  spectrum.params.displayView = 'spectrum';
  const svg = exported([laser, camera, profile, spectrum]);

  // The markup this test exists for must actually be drawn.
  assert.match(svg, /<path data-camera-profile-fill=/);
  assert.match(svg, /<path data-camera-profile-curve=/);
  assert.match(svg, /<line data-spectrum-baseline=/);
  assert.equal(xmlProblem(svg), null);
});

test('every component, labelled with markup characters, and every detector screen view export as well-formed XML', () => {
  const views = registry.display.params.find(param => param.key === 'displayView').options.map(([value]) => value);
  assert.ok(views.length >= 3, 'expected the detector screen views');
  for (const type of Object.keys(registry)) {
    const element = createElement(type, 300, 0);
    element.label = 'A & B <5 mW> "q" \'s\'';
    const scene = [createElement('cwlaser', 0, 0), element];
    if (registry[type].readoutKind) {
      views.forEach((view, index) => {
        const display = createElement('display', 420, 80 * (index + 1));
        display.params.sensorId = element.id;
        display.params.displayView = view;
        scene.push(display);
      });
    }
    const problem = xmlProblem(exported(scene));
    assert.equal(problem, null, `${type}: ${problem}`);
  }
});

// Every bundled example and published community scene, as the SVG download
// and as a white-backed animation frame, which is what the GIF export
// renders (the PNG export is the same figure on white).
for (const { path, slug } of await sceneFiles()) {
  test(`export is well-formed XML: ${slug}`, async () => {
    const scene = sceneFromFile(await readFile(path, 'utf8'));
    assert.equal(xmlProblem(exported(scene.elements, scene.beams)), null, 'SVG download');
    const frame = exported(scene.elements, scene.beams, { whiteBg: true, animation: { seconds: 0.5, playback: {} } });
    assert.equal(xmlProblem(frame), null, 'animation frame');
  });
}
