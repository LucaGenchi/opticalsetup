import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry, getVisualBounds, boxAnchor, getElementMeta, getDirectManipulation } from '../sketch/js/elements.js';
import { linkifyText } from '../sketch/js/util.js';

// ---------------- text label: left-anchored, grows rightward ----------------

test('a text label anchors its left edge and grows to the right as text is typed', () => {
  const label = createElement('textlabel', 100, 50);
  const svg = registry.textlabel.svg(label);
  assert.match(svg, /text-anchor="start"/, 'text should hang off its left edge, not be centered on the drop point');
  assert.match(svg, /x="0"/, 'text starts exactly at the element origin');

  const shortBounds = getVisualBounds(label);
  label.params.text = 'A much, much longer label than before';
  const longBounds = getVisualBounds({ ...label });

  assert.equal(shortBounds.x0, longBounds.x0, 'the left edge must not move as the text grows');
  assert.ok(longBounds.x1 > shortBounds.x1, 'the box should only expand to the right');
});

test('text labels turn safe web and DOI addresses into SVG hyperlinks', () => {
  const label = createElement('textlabel', 0, 0);
  label.params.text = 'Paper: doi:10.1000/182; data: https://example.org/result?a=1&b=2.';
  const svg = registry.textlabel.svg(label);

  assert.match(svg, /href="https:\/\/doi\.org\/10\.1000\/182"/);
  assert.match(svg, /href="https:\/\/example\.org\/result\?a=1&amp;b=2"/);
  assert.match(svg, /data-text-link="true"/);
  assert.match(svg, /text-decoration="underline"/);
  assert.match(svg, /<\/a>\.<\/text>$/);
});

test('link detection trims prose punctuation, preserves DOI parentheses, and rejects active schemes', () => {
  assert.deepEqual(linkifyText('See https://example.org/a).'), [
    { text: 'See ', href: null },
    { text: 'https://example.org/a', href: 'https://example.org/a' },
    { text: ').', href: null },
  ]);
  assert.deepEqual(linkifyText('10.1002/(SICI)1234-5678(19990101)1:1<1::AID-ABC>3.0.CO;2-P'), [
    { text: '10.1002/(SICI)1234-5678(19990101)1:1', href: 'https://doi.org/10.1002/(SICI)1234-5678(19990101)1:1' },
    { text: '<1::AID-ABC>3.0.CO;2-P', href: null },
  ]);
  assert.deepEqual(linkifyText('javascript:alert(1)'), [{ text: 'javascript:alert(1)', href: null }]);
  assert.deepEqual(linkifyText('notwww.example.org x10.1000/182'), [
    { text: 'notwww.example.org x10.1000/182', href: null },
  ]);
});

test('non-link annotation markup remains escaped', () => {
  const label = createElement('textlabel', 0, 0);
  label.params.text = '<script>alert("x")</script>';
  const svg = registry.textlabel.svg(label);
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
});

test('text label help announces automatic web and DOI links', () => {
  assert.match(getElementMeta('textlabel', createElement('textlabel').params).description, /web and DOI addresses become clickable links/i);
});

test('boxAnchor is the identity offset for every element type except the left-anchored text label', () => {
  const laser = createElement('cwlaser', 0, 0);
  assert.deepEqual(boxAnchor(laser), { x: 0, y: 0 });

  const label = createElement('textlabel', 0, 0);
  const off = boxAnchor(label);
  assert.equal(off.y, 0);
  assert.ok(off.x > 0, 'the left-anchored box center sits to the right of the element origin');
  assert.equal(off.x, registry.textlabel.size(label).w / 2);
});

// ---------------- figure frame + highlight: anchor-corner resize wiring ----------------

test('the figure frame and highlight both declare corner-anchored resize, not center-scaling', () => {
  // Regression: dragging one corner used to scale both edges out from the
  // fixed center, so pulling the top-right corner right also grew the box
  // leftward. anchor: true tells canvas.js to keep the opposite corner
  // fixed in world space instead.
  const frame = getDirectManipulation(createElement('figureframe', 0, 0));
  assert.equal(frame.resize.anchor, true);
  assert.equal(frame.resize.x, 'w');
  assert.equal(frame.resize.y, 'h');

  const highlight = getDirectManipulation(createElement('highlight', 0, 0));
  assert.equal(highlight.resize.anchor, true);
});

// ---------------- highlight annotation ----------------

test('the highlight annotation is a background-only shape that never touches rays', () => {
  const h = createElement('highlight');
  assert.equal(h.params.shape, 'rect');
  assert.equal(registry.highlight.surfaces(h).length, 0);
  assert.equal(getElementMeta('highlight', h.params).tier, 'diagram');
});

test('a rectangular highlight hit-tests its full filled area, and a circular one is elliptical', () => {
  const rect = createElement('highlight');
  rect.params.w = 100; rect.params.h = 40;
  assert.equal(registry.highlight.hitTest(rect, { x: 40, y: 15 }, 0), true, 'inside the rectangle');
  assert.equal(registry.highlight.hitTest(rect, { x: 49, y: 19 }, 0), true, 'near the rectangle corner, still inside');
  assert.equal(registry.highlight.hitTest(rect, { x: 60, y: 0 }, 0), false, 'outside the rectangle width');

  const circle = createElement('highlight');
  circle.params.shape = 'circle';
  circle.params.w = 100; circle.params.h = 100;
  assert.equal(registry.highlight.hitTest(circle, { x: 35, y: 35 }, 0), true, 'inside the inscribed circle');
  assert.equal(registry.highlight.hitTest(circle, { x: 48, y: 48 }, 0), false, 'inside the bounding box but outside the circle');
});

test('the highlight shape renders with the configured fill and opacity, both shapes', () => {
  const rect = createElement('highlight');
  rect.params.fill = '#112233';
  rect.params.opacity = 40;
  const rectSvg = registry.highlight.svg(rect);
  assert.match(rectSvg, /<rect /);
  assert.match(rectSvg, /fill="#112233"/);
  assert.match(rectSvg, /fill-opacity="0\.4"/);

  const circle = createElement('highlight');
  circle.params.shape = 'circle';
  const circleSvg = registry.highlight.svg(circle);
  assert.match(circleSvg, /<ellipse /);
});

test('a highlight can carry a label like any other element', () => {
  const h = createElement('highlight');
  assert.equal(registry.highlight.noLabel, undefined, 'highlight must not opt out of the standard label system');
});

test('bare DOI detection does not swallow ordinary measurements written on a figure', () => {
  // "10.<4-9 digits>/<something>" is also what a rate or a ruling density looks
  // like. Real DOI suffixes are longer and carry a digit or a dot; unit strings
  // do not, so these must stay inert text.
  for (const prose of ['grating 10.1000/mm ruling', 'count rate 10.1234/s on the PMT',
                       'dispersion 10.2500/nm across the band', 'split ratio 10.5000/2',
                       'divergence 10.1000/mrad']) {
    assert.deepEqual(linkifyText(prose), [{ text: prose, href: null }],
      `"${prose}" must not be turned into a DOI link`);
  }

  // ...while genuine citations, bare or prefixed, still resolve.
  for (const [doi, href] of [
    ['10.1364/OE.27.036809', 'https://doi.org/10.1364/OE.27.036809'],
    ['10.1016/j.optcom.2019.02.021', 'https://doi.org/10.1016/j.optcom.2019.02.021'],
    ['10.1038/s41566-020-0678-x', 'https://doi.org/10.1038/s41566-020-0678-x'],
    ['10.1000/182', 'https://doi.org/10.1000/182'],
  ]) {
    assert.deepEqual(linkifyText(doi), [{ text: doi, href }], `${doi} should still link`);
  }

  // An explicitly marked DOI stays permissive — the author has said what it is.
  assert.deepEqual(linkifyText('doi:10.1000/ab'), [
    { text: 'doi:10.1000/ab', href: 'https://doi.org/10.1000/ab' },
  ]);
});

test('every generated annotation link is an http(s) URL, whatever the authored text', () => {
  const hostile = [
    'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html;base64,PHN2Zz4=',
    'vbscript:msgbox(1)', 'file:///etc/passwd', 'www.javascript:alert(1)',
    'doi:10.1000/javascript:alert(1)', 'https://ok.example/a?next=javascript:alert(1)',
    'http://x.example" onclick="alert(1)', "http://x.example' onload='alert(1)",
  ];
  for (const text of hostile) {
    for (const part of linkifyText(text)) {
      if (!part.href) continue;
      assert.match(part.href, /^https?:\/\//i, `"${text}" produced a non-web href: ${part.href}`);
    }
  }
});
