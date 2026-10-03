// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { buildSVG } from '../sketch/js/export.js';
import { registry } from '../sketch/js/elements.js';
// Registers the redesigned detector catalogue and the Etalon/VIPA element
// onto `registry`. Required here because this tool validates scenes with
// parseSketch(..., registry): without these, a sketch using a Power meter,
// Polarimeter, Spectrometer, Wavefront detector, General detector,
// Etalon, or VIPA is rejected as an unknown type.
import '../sketch/js/detector-instruments.js';
import '../sketch/js/etalon.js';
import '../sketch/js/vipa.js';

import { traceAll } from '../sketch/js/raytrace.js';
import { parseSketch, state } from '../sketch/js/state.js';

const REPOSITORY = 'LucaGenchi/opticalsetup';
// The current site and its GitHub Pages mirror, plus the mirror's old name:
// links people shared before the repository was renamed still work.
const ALLOWED_SHARE_LOCATIONS = new Set([
  'opticalsetup.com/sketch/',
  'www.opticalsetup.com/sketch/',
  'lucagenchi.github.io/opticalsetup/sketch/',
  'lucagenchi.github.io/optics-sketch/sketch/',
]);
const MAX_SCENE_BYTES = 250_000;
const MAX_ELEMENTS = 200;
const MAX_SOURCES = 30;
const MAX_BEAMS = 100;
const MAX_MANUAL_POINTS = 2_000;
const MAX_STRING_CHARS = 5_000;
const MAX_REFERENCE_CHARS = 500;
const INVALID_SVG_NUMBER = /\b(?:NaN|Infinity|-Infinity)\b/;

function issueField(body, heading, nextHeading = null, { last = false } = {}) {
  const marker = `### ${heading}`;
  const startAt = last ? body.lastIndexOf(marker) : body.indexOf(marker);
  if (startAt < 0) throw new Error(`Issue is missing “${heading}”`);
  const valueStart = startAt + marker.length;
  const valueEnd = nextHeading ? body.lastIndexOf(`### ${nextHeading}`) : body.indexOf('\n### ', valueStart);
  const value = body.slice(valueStart, valueEnd < valueStart ? body.length : valueEnd).trim();
  if (!value || value === '_No response_') throw new Error(`Issue is missing “${heading}”`);
  return value;
}

// The same slice, with its line structure intact. issueField() trims, which
// would turn an indented code example at the start of a section into a line
// flush left -- exactly the disguise the checkbox scan must see through.
function rawIssueField(body, heading, nextHeading = null) {
  const marker = `### ${heading}`;
  const startAt = body.indexOf(marker);
  if (startAt < 0) return '';
  const valueStart = startAt + marker.length;
  const valueEnd = nextHeading ? body.lastIndexOf(`### ${nextHeading}`) : body.indexOf('\n### ', valueStart);
  return body.slice(valueStart, valueEnd < valueStart ? body.length : valueEnd).replace(/^\r?\n/, '');
}

function optionalIssueField(body, heading, nextHeading = null, { last = false } = {}) {
  try { return issueField(body, heading, nextHeading, { last }); }
  catch (_) { return ''; }
}

function cleanName(value) {
  const name = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (name.length < 3 || name.length > 100) throw new Error('Setup name must contain 3–100 characters');
  return name;
}

function cleanDescription(value) {
  const description = value.trim();
  if (description.length < 10 || description.length > 2_000) {
    throw new Error('Description must contain 10–2000 characters');
  }
  return description;
}

function cleanReference(value) {
  const reference = value.trim();
  if (!reference) return null;
  if (reference.length > MAX_REFERENCE_CHARS) throw new Error(`Reference must be at most ${MAX_REFERENCE_CHARS} characters`);
  return reference;
}

export function extractProposalIssue(body) {
  if (typeof body !== 'string' || body.length > 80_000) throw new Error('Issue body is invalid or too large');
  const name = cleanName(issueField(body, 'Setup name', 'What does this setup demonstrate?'));
  const description = cleanDescription(issueField(body, 'What does this setup demonstrate?', 'OpticalSetup share link'));
  const setupField = issueField(body, 'OpticalSetup share link', 'Reference (optional)');
  const shareURL = setupField.match(/https:\/\/[^\s<>]+/)?.[0];
  if (!shareURL) throw new Error('Issue does not contain an HTTPS OpticalSetup share link');
  const reference = cleanReference(optionalIssueField(body, 'Reference (optional)', 'Contribution acknowledgement'));
  const acknowledgement = issueField(body, 'Contribution acknowledgement');
  if (!/- \[[xX]\]/.test(acknowledgement)) throw new Error('Contribution acknowledgement is required');
  const license = grantFrom(rawIssueField(body, 'Contribution acknowledgement'));
  return { name, description, reference, shareURL, license };
}

// The affirmative grant, exactly as each supported version of the form words
// it. Recognising the licence *name* is not enough: an issue body is editable,
// and "I do NOT license this setup under CC BY 4.0" mentions it too. A line
// only grants the licence when it matches one of these word for word, so a
// reworded or unfamiliar line leaves the submission unlicensed rather than
// being guessed at.
const GRANT_TEXTS = [
  {
    version: 'example-proposal/2026-09',
    content: 'CC-BY-4.0',
    text: 'I have the right to license this setup and its description, and I publish them under CC BY 4.0 '
      + '(credit to me, reuse and adaptation allowed). The app itself stays GPL-3.0-or-later.',
  },
];

const normalizeGrant = line => line.replace(/\s+/g, ' ').trim().toLowerCase();

// Lines a reader would see as ticked boxes. An issue body is Markdown that
// anyone can edit, so a line that merely looks like a checkbox is not one:
// it may be inside a code block, quoted, or indented as an example. The
// fence rules follow CommonMark -- a block opened with N backticks closes
// only on at least N backticks, never on tildes or a shorter run -- because
// toggling on any fence let `````` ``` G ``` `````` and "``` ~~~ G ```" both
// leave G outside, and trimming indentation let four leading spaces pass an
// indented code example off as a real checkbox.
function checkedLines(section) {
  const out = [];
  let fence = null;
  for (const raw of section.split('\n')) {
    const line = raw.replace(/\t/g, '    ');
    const indent = line.match(/^ */)[0].length;
    const rest = line.slice(indent);
    // A fence may be indented up to three spaces; four or more is code.
    const fenceMatch = indent <= 3 ? rest.match(/^(`{3,}|~{3,})(.*)$/) : null;
    if (fence) {
      const closes = fenceMatch
        && fenceMatch[1][0] === fence.char
        && fenceMatch[1].length >= fence.length
        && fenceMatch[2].trim() === '';   // a closing fence carries no info string
      if (closes) fence = null;
      continue;                            // everything until then is code
    }
    if (fenceMatch) { fence = { char: fenceMatch[1][0], length: fenceMatch[1].length }; continue; }
    if (indent >= 4) continue;             // an indented code block
    if (rest.startsWith('>')) continue;    // quoted from somewhere else
    if (indent > 0) continue;              // the form writes its boxes flush left
    const match = rest.match(/^- \[[xX]\]\s*(.*)$/);
    if (match) out.push(match[1].trim());
  }
  return out;
}

// The licence grant is recorded only when its own box is ticked, with the
// text that was ticked and which form version it came from. The older form
// had one box, about permission to share, so reprocessing an old issue
// cannot manufacture a grant nobody gave.
export function grantFrom(acknowledgement) {
  for (const text of checkedLines(acknowledgement)) {
    const known = GRANT_TEXTS.find(grant => normalizeGrant(grant.text) === normalizeGrant(text));
    if (known) return { content: known.content, text, formVersion: known.version };
  }
  return null;
}

function decodeBase64URL(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Share link contains invalid characters');
  return Buffer.from(value, 'base64url');
}

export function sceneFromShareURL(value) {
  let url;
  try { url = new URL(value); } catch (_) { throw new Error('Share link is not a valid URL'); }
  const location = `${url.hostname.toLowerCase()}${url.pathname}`;
  if (url.protocol !== 'https:' || !ALLOWED_SHARE_LOCATIONS.has(location)) {
    throw new Error('Share link must use an official OpticalSetup address');
  }
  if (!url.hash.startsWith('#sketch=')) throw new Error('Share link does not contain a setup');
  const payload = url.hash.slice('#sketch='.length);
  const separator = payload.indexOf('.');
  if (separator !== 1) throw new Error('Share link uses an unsupported format');
  const encoded = decodeBase64URL(payload.slice(2));
  let bytes;
  if (payload[0] === 'g') {
    try { bytes = gunzipSync(encoded, { maxOutputLength: MAX_SCENE_BYTES + 1 }); }
    catch (_) { throw new Error('Compressed setup is damaged or too large'); }
  } else if (payload[0] === 'j') {
    bytes = encoded;
  } else {
    throw new Error('Share link uses an unsupported encoding');
  }
  if (bytes.length > MAX_SCENE_BYTES) throw new Error('Setup is too large for an example proposal');
  let raw;
  try { raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch (_) { throw new Error('Setup contains invalid JSON'); }
  return raw;
}

function validateSceneShape(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.elements) || !Array.isArray(raw.beams)) {
    throw new Error('Setup is not a complete OpticalSetup scene');
  }
  if (raw.elements.length > MAX_ELEMENTS) throw new Error(`Setup exceeds the ${MAX_ELEMENTS}-element proposal limit`);
  if (raw.beams.length > MAX_BEAMS) throw new Error(`Setup exceeds the ${MAX_BEAMS}-beam proposal limit`);
  const sourceCount = raw.elements.reduce((sum, element) => sum + (registry[element?.type]?.source ? 1 : 0), 0);
  if (sourceCount > MAX_SOURCES) throw new Error(`Setup exceeds the ${MAX_SOURCES}-source proposal limit`);
  const pointCount = raw.beams.reduce((sum, beam) => sum + (Array.isArray(beam?.pts) ? beam.pts.length : 0), 0);
  if (pointCount > MAX_MANUAL_POINTS) throw new Error(`Setup exceeds the ${MAX_MANUAL_POINTS}-point proposal limit`);
  const pending = [raw];
  while (pending.length) {
    const value = pending.pop();
    if (typeof value === 'string' && value.length > MAX_STRING_CHARS) {
      throw new Error(`Setup contains text longer than ${MAX_STRING_CHARS} characters`);
    }
    if (Array.isArray(value)) pending.push(...value);
    else if (value && typeof value === 'object') pending.push(...Object.values(value));
  }
  const ids = [...raw.elements, ...raw.beams].map(item => item?.id);
  if (ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) {
    throw new Error('Every submitted object must have a unique ID');
  }
}

function safePRName(name) {
  return name.replace(/@/g, '＠').replace(/[<>]/g, '').slice(0, 100);
}

export function materializeProposal({ issueNumber, issueBody, userLogin, createdAt }) {
  const number = Number(issueNumber);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('Issue number is invalid');
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(userLogin || '')) throw new Error('GitHub user is invalid');
  const submittedAt = new Date(createdAt);
  if (!Number.isFinite(submittedAt.getTime())) throw new Error('Issue creation time is invalid');
  const fields = extractProposalIssue(issueBody);
  const raw = sceneFromShareURL(fields.shareURL);
  validateSceneShape(raw);
  const scene = parseSketch(raw, registry);
  traceAll(scene.elements, scene.beams);

  const previous = { elements: state.elements, beams: state.beams };
  state.elements = scene.elements;
  state.beams = scene.beams;
  let svg;
  try { svg = buildSVG(); }
  finally {
    state.elements = previous.elements;
    state.beams = previous.beams;
  }
  if (!svg.startsWith('<svg ') || INVALID_SVG_NUMBER.test(svg)) throw new Error('Setup does not produce finite SVG output');

  const canonicalScene = { app: 'optics2d', version: 1, elements: scene.elements, beams: scene.beams };
  const sceneJSON = JSON.stringify(canonicalScene);
  const issueURL = `https://github.com/${REPOSITORY}/issues/${number}`;
  const proposal = {
    schema: 1,
    name: fields.name,
    description: fields.description,
    reference: fields.reference,
    author: { github: userLogin, profile: `https://github.com/${userLogin}` },
    source: { issue: issueURL, submittedAt: submittedAt.toISOString() },
    // The grant the submitter ticked, with the text they ticked and where it
    // can be read. Absent when the form did not carry the licence checkbox or
    // it was left unticked: those submissions stay unlicensed, and their pages
    // claim no reuse rights. `recordedAt` is when this record was written --
    // an issue can be edited, so it is not evidence of when consent was given;
    // the issue URL is where the acknowledgement itself can be read.
    ...(fields.license ? {
      license: {
        content: fields.license.content,
        text: fields.license.text,
        evidence: issueURL,
        form: 'example-proposal#contribution-acknowledgement',
        formVersion: fields.license.formVersion,
        recordedAt: new Date().toISOString(),
      },
    } : {}),
    sceneSha256: createHash('sha256').update(sceneJSON).digest('hex'),
    scene: canonicalScene,
  };
  const safeName = safePRName(fields.name);
  const deliveryName = safeName || `Setup from issue ${number}`;
  return {
    proposal,
    proposalFile: `community-submissions/issue-${number}.json`,
    branchName: `example-proposal/issue-${number}`,
    commitSubject: `Propose community setup: ${deliveryName}`,
    prTitle: `Propose community setup: ${deliveryName}`,
    prBody: [
      `Community setup proposal generated from #${number}.`,
      '',
      `Submitted by @${userLogin}.`,
      '',
      'Automated checks performed:',
      '- parsed and normalized with the current component registry',
      '- traced without an exception',
      '- exported to finite SVG geometry',
      '- passed the repository test suite before this pull request was opened',
      '',
      'Review the setup and description, then merge this pull request to approve it. The publishing workflow generates the Community page and app manifest after the merge. Close the pull request to reject it. No status or generated-file edits are required.',
    ].join('\n'),
  };
}

function writeOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function runFromEnvironment() {
  const result = materializeProposal({
    issueNumber: process.env.ISSUE_NUMBER,
    issueBody: process.env.ISSUE_BODY,
    userLogin: process.env.ISSUE_USER_LOGIN,
    createdAt: process.env.ISSUE_CREATED_AT,
  });
  mkdirSync('community-submissions', { recursive: true });
  writeFileSync(result.proposalFile, `${JSON.stringify(result.proposal, null, 2)}\n`);
  const bodyFile = `${process.env.RUNNER_TEMP || '/tmp'}/opticalsetup-example-pr-${process.env.ISSUE_NUMBER}.md`;
  writeFileSync(bodyFile, `${result.prBody}\n`);
  writeOutput('proposal_file', result.proposalFile);
  writeOutput('branch_name', result.branchName);
  writeOutput('commit_subject', result.commitSubject);
  writeOutput('pr_title', result.prTitle);
  writeOutput('pr_body_file', bodyFile);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) runFromEnvironment();
