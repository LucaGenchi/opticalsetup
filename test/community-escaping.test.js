// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { materializeProposal } from '../scripts/materialize-example-proposal.mjs';
import { pageHTML } from '../tools/build-community.mjs';

function submittedPage(name, description, reference = '_No response_') {
  const scene = { app: 'optics2d', version: 1, elements: [], beams: [] };
  const url = 'https://opticalsetup.com/sketch/#sketch=j.' + Buffer.from(JSON.stringify(scene)).toString('base64url');
  const issueBody = `### Setup name\n\n${name}\n\n### What does this setup demonstrate?\n\n${description}\n\n### OpticalSetup share link\n\n${url}\n\n### Reference (optional)\n\n${reference}\n\n### Contribution acknowledgement\n\n- [x] I created this setup.`;
  const { proposal } = materializeProposal({ issueNumber: 123, issueBody, userLogin: 'contributor', createdAt: '2026-10-03T00:00:00Z' });
  return pageHTML({ ...proposal, slug: 'escaping-test' });
}

test('accepted submission text cannot create iframe or metadata attributes', () => {
  const name = `Review" onload="this.dataset.probe='executed'" x="`;
  const description = 'A description" autofocus onfocus="alert(1)" x=" with quotes & <markup>.';
  const html = submittedPage(name, description);
  const iframe = html.match(/<iframe\b[^>]*>/)[0];
  assert.match(iframe, /title="Review&quot; onload=&quot;/);
  assert.doesNotMatch(iframe, /\sonload="/);
  assert.ok(iframe.includes('onload=&quot;this.dataset.probe=\'executed\'&quot;'));
  for (const meta of html.matchAll(/<meta\b[^>]*>/g)) {
    assert.doesNotMatch(meta[0], /\s(?:autofocus|onfocus)=?\s*"/);
  }
  assert.ok(html.includes('with quotes &amp; &lt;markup&gt;.'));
});

test('a quoted reference remains a single href and ordinary title text stays readable', () => {
  const html = submittedPage('A "quoted" setup', 'A normal description of the setup.', 'https://example.org/" onclick="alert(1)');
  assert.ok(html.includes('<h1>A "quoted" setup</h1>'));
  assert.ok(html.includes('href="https://example.org/&quot; onclick=&quot;alert(1)"'));
  for (const anchor of html.matchAll(/<a\b[^>]*>/g)) assert.doesNotMatch(anchor[0], /\sonclick="/);
});
