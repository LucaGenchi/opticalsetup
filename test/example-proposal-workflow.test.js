import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  extractProposalIssue,
  materializeProposal,
  sceneFromShareURL,
} from '../scripts/materialize-example-proposal.mjs';

const scene = {
  app: 'optics2d',
  version: 1,
  elements: [
    {
      id: 'e-source', type: 'cwlaser', x: 80, y: 120, rot: 0, label: 'proposal source', showLabel: true,
      params: { wavelength: 532 },
    },
    {
      id: 'e-lens', type: 'lens', x: 260, y: 120, rot: 0, label: 'focusing lens', showLabel: true,
      params: { f: 100, dia: 25.4 },
    },
  ],
  beams: [],
};

function shareURL(value = scene, host = 'opticalsetup.com', encoding = 'g', path = '/v1/sketch/') {
  const json = JSON.stringify(value);
  const bytes = encoding === 'g' ? gzipSync(json) : Buffer.from(json);
  return `https://${host}${path}#sketch=${encoding}.${bytes.toString('base64url')}`;
}

function issueBody({
  link = shareURL(),
  checked = true,
  checkmark = 'x',
  description = 'Shows a simple focusing path with a labelled source and lens.',
  reference = '_No response_',
} = {}) {
  return `### Setup name

Green focusing path

### What does this setup demonstrate?

${description}

### OpticalSetup share link

${link}

### Reference (optional)

${reference}

### Contribution acknowledgement

- [${checked ? checkmark : ' '}] I created or have permission to share this setup.
`;
}

test('proposal issue fields survive a heading-like string in the description', () => {
  const fields = extractProposalIssue(issueBody({
    description: 'Explains the layout.\n\n### OpticalSetup share link\n\nThis sentence is not the actual link.',
  }));
  assert.equal(fields.name, 'Green focusing path');
  assert.match(fields.description, /not the actual link/);
  assert.equal(fields.shareURL, shareURL());
  assert.equal(fields.reference, null);
});

test('proposal issue fields read an optional reference when provided', () => {
  const fields = extractProposalIssue(issueBody({ reference: 'Hecht, Optics, 5th ed., §9.4' }));
  assert.equal(fields.reference, 'Hecht, Optics, 5th ed., §9.4');
});

test('proposal materialization normalizes, traces, exports, and records provenance', () => {
  const result = materializeProposal({
    issueNumber: '42',
    issueBody: issueBody(),
    userLogin: 'example-contributor',
    createdAt: '2026-07-22T10:30:00Z',
  });
  assert.equal(result.proposalFile, 'community-submissions/issue-42.json');
  assert.equal(result.branchName, 'example-proposal/issue-42');
  assert.equal(Object.hasOwn(result.proposal, 'status'), false);
  assert.equal(result.proposal.name, 'Green focusing path');
  assert.equal(result.proposal.reference, null);
  assert.equal(result.proposal.author.github, 'example-contributor');
  assert.equal(result.proposal.source.issue, 'https://github.com/LucaGenchi/optics-sketch/issues/42');
  assert.equal(result.proposal.scene.elements.length, 2);
  assert.match(result.proposal.sceneSha256, /^[0-9a-f]{64}$/);
  assert.match(result.prBody, /parsed and normalized/);
  assert.match(result.prBody, /merge this pull request to approve/i);
  assert.match(result.prBody, /publishing workflow generates/i);
  assert.doesNotMatch(result.prBody, /status.*approved/i);
});

test('proposal workflow opens a normal pull request and merge publishes generated files', async () => {
  const proposalWorkflow = await readFile(new URL('../.github/workflows/example-proposal.yml', import.meta.url), 'utf8');
  const publishWorkflow = await readFile(new URL('../.github/workflows/publish-community.yml', import.meta.url), 'utf8');
  assert.match(proposalWorkflow, /git add "\$PROPOSAL_FILE"/);
  assert.match(proposalWorkflow, /gh pr create --base main/);
  assert.doesNotMatch(proposalWorkflow, /gh pr create --draft/);
  assert.match(publishWorkflow, /community-submissions\/\*\.json/);
  assert.match(publishWorkflow, /node tools\/build-community\.mjs/);
  assert.match(publishWorkflow, /git add community sketch\/js\/community-data\.js/);
});

test('proposal materialization records a provided reference', () => {
  const result = materializeProposal({
    issueNumber: '44',
    issueBody: issueBody({ reference: 'Hecht, Optics, 5th ed., §9.4' }),
    userLogin: 'example-contributor',
    createdAt: '2026-07-22T10:30:00Z',
  });
  assert.equal(result.proposal.reference, 'Hecht, Optics, 5th ed., §9.4');
});

test('proposal materialization accepts GitHub issue forms uppercase checkbox output', () => {
  const result = materializeProposal({
    issueNumber: '43',
    issueBody: issueBody({ checkmark: 'X' }),
    userLogin: 'example-contributor',
    createdAt: '2026-07-22T10:30:00Z',
  });
  assert.equal(result.proposalFile, 'community-submissions/issue-43.json');
});

test('proposal materialization requires acknowledgement and official share links', () => {
  assert.throws(() => materializeProposal({
    issueNumber: 42,
    issueBody: issueBody({ checked: false }),
    userLogin: 'example-contributor',
    createdAt: '2026-07-22T10:30:00Z',
  }), /acknowledgement/i);
  assert.throws(() => sceneFromShareURL(shareURL(scene, 'example.com')), /official/i);
  assert.doesNotThrow(() => sceneFromShareURL(shareURL(scene, 'opticalsetup.com', 'g', '/sketch/')));
  assert.doesNotThrow(() => sceneFromShareURL(shareURL(
    scene,
    'lucagenchi.github.io',
    'g',
    '/optics-sketch/v1/sketch/',
  )));
});

test('proposal materialization rejects duplicate IDs and unsupported encodings', () => {
  const duplicate = structuredClone(scene);
  duplicate.elements[1].id = duplicate.elements[0].id;
  assert.throws(() => materializeProposal({
    issueNumber: 42,
    issueBody: issueBody({ link: shareURL(duplicate) }),
    userLogin: 'example-contributor',
    createdAt: '2026-07-22T10:30:00Z',
  }), /unique ID/i);
  assert.throws(() => sceneFromShareURL(shareURL(scene, 'opticalsetup.com', 'x')), /unsupported encoding/i);
});
