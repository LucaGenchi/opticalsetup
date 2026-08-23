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

const REPOSITORY = 'LucaGenchi/optics-sketch';
const ALLOWED_SHARE_PATHS = new Map([
  ['opticalsetup.com', /^\/(?:v[1-9]\d*\/)?sketch\/$/],
  ['www.opticalsetup.com', /^\/(?:v[1-9]\d*\/)?sketch\/$/],
  ['lucagenchi.github.io', /^\/optics-sketch\/(?:v[1-9]\d*\/)?sketch\/$/],
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
  return { name, description, reference, shareURL };
}

function decodeBase64URL(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Share link contains invalid characters');
  return Buffer.from(value, 'base64url');
}

export function sceneFromShareURL(value) {
  let url;
  try { url = new URL(value); } catch (_) { throw new Error('Share link is not a valid URL'); }
  const allowedPath = ALLOWED_SHARE_PATHS.get(url.hostname.toLowerCase());
  if (url.protocol !== 'https:' || !allowedPath?.test(url.pathname)) {
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
