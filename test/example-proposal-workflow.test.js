// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  ProposalError,
  extractProposalIssue,
  issueFromJSON,
  materializeProposal,
  reportableError,
  sceneFromShareURL,
} from '../scripts/materialize-example-proposal.mjs';
import { goldenDifferences } from '../tools/golden-compare.mjs';
import { goldenFor, sceneFromFile } from '../tools/update-golden.mjs';

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

function shareURL(value = scene, host = 'opticalsetup.com', encoding = 'g') {
  const json = JSON.stringify(value);
  const bytes = encoding === 'g' ? gzipSync(json) : Buffer.from(json);
  return `https://${host}/sketch/#sketch=${encoding}.${bytes.toString('base64url')}`;
}

function issueBody({
  link = shareURL(),
  checked = true,
  checkmark = 'x',
  description = 'Shows a simple focusing path with a labelled source and lens.',
  reference = '_No response_',
  acknowledgement = null,
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

${acknowledgement ?? `- [${checked ? checkmark : ' '}] I created or have permission to share this setup.`}
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
  assert.equal(result.proposal.source.issue, 'https://github.com/LucaGenchi/opticalsetup/issues/42');
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

const GRANT = '- [x] I have the right to license this setup and its description, and I publish them under CC BY 4.0 (credit to me, reuse and adaptation allowed). The app itself stays GPL-3.0-or-later.';
const SHARE_BOX = '- [x] I created or have permission to share this setup, and I understand that it will be publicly reviewed and may be modified if accepted.';
const materialize = acknowledgement => materializeProposal({
  issueNumber: '42',
  issueBody: issueBody(acknowledgement === undefined ? {} : { acknowledgement }),
  userLogin: 'example-contributor',
  createdAt: '2026-07-22T10:30:00Z',
}).proposal;

test('a licence is recorded only when its own box is ticked', () => {
  // The old form had one checkbox, about permission to share. Re-running an
  // issue written against it must not manufacture a CC BY grant.
  assert.equal(materialize(SHARE_BOX).license, undefined, 'no grant was given, so none is recorded');
  assert.equal(materialize(undefined).license, undefined, 'the default fixture has no grant either');
  assert.equal(materialize([SHARE_BOX, GRANT.replace('- [x]', '- [ ]')].join('\n')).license, undefined,
    'an unticked grant is not a grant');

  // The licence name is not the grant: an issue body is editable, and a line
  // can name CC BY while refusing it. Only the affirmative wording counts,
  // and only as a real ticked box -- not quoted, not inside a code fence.
  assert.equal(materialize([SHARE_BOX, '- [x] I do NOT license this setup under CC BY 4.0.'].join('\n')).license,
    undefined, 'a refusal that names the licence is not a grant');
  assert.equal(materialize([SHARE_BOX, '- [x] I might license this under CC BY 4.0 later.'].join('\n')).license,
    undefined, 'neither is a reworded line');
  assert.equal(materialize([SHARE_BOX, `> ${GRANT}`].join('\n')).license,
    undefined, 'a quoted grant is someone citing the form, not ticking it');
  assert.equal(materialize([SHARE_BOX, '```', GRANT, '```'].join('\n')).license,
    undefined, 'nor is one inside a code fence');

  // A body is editable Markdown, so a line that looks like a checkbox may be
  // inside a code block. CommonMark closes a fence only on the same character
  // and at least the same length, and four spaces of indent is itself code.
  assert.equal(materialize(['````', '```', GRANT, '````'].join('\n')).license, undefined,
    'a shorter run does not close a longer fence');
  assert.equal(materialize(['```', '~~~', GRANT, '```'].join('\n')).license, undefined,
    'tildes do not close a backtick fence');
  assert.equal(materialize(`    ${GRANT}`).license, undefined,
    'four spaces of indent is an example, not a box');
  assert.equal(materialize([SHARE_BOX, `  ${GRANT}`].join('\n')).license, undefined,
    'the form writes its boxes flush left');
  // And a genuine tick after a properly closed fence still counts.
  const afterFence = materialize(['```', 'an example someone pasted', '```', SHARE_BOX, GRANT].join('\n')).license;
  assert.equal(afterFence?.content, 'CC-BY-4.0', 'a real box after a closed fence is a grant');

  const granted = materialize([SHARE_BOX, GRANT].join('\n')).license;
  assert.equal(granted.content, 'CC-BY-4.0');
  assert.match(granted.text, /CC BY 4\.0/, 'the text that was ticked is kept with the record');
  assert.equal(granted.evidence, 'https://github.com/LucaGenchi/opticalsetup/issues/42',
    'and where it can be read');
  assert.ok(Date.parse(granted.recordedAt) > 0, 'recordedAt says when this record was written');
  assert.equal(granted.formVersion, 'example-proposal/2026-09', 'and which wording was accepted');
});

// --- The workflow end to end ---------------------------------------------
// Every run since the golden snapshots arrived (#174) failed its own test
// step, because a new submission had no snapshot; and a proposal retitled to
// its setup's name was skipped without a word.

test('a proposal carries the tracer snapshot the golden test compares it with', () => {
  const result = materializeProposal({
    issueNumber: 42,
    issueBody: issueBody(),
    userLogin: 'example-contributor',
    createdAt: '2026-07-22T10:30:00Z',
  });
  assert.equal(result.goldenFile, 'test/golden/community-submissions-issue-42.json',
    'the name the golden test looks for');
  assert.equal(result.proposalText, `${JSON.stringify(result.proposal, null, 2)}\n`);
  const recorded = JSON.parse(result.goldenText);
  assert.equal(recorded.elements, 2);
  assert.deepEqual(goldenDifferences(recorded, goldenFor(sceneFromFile(result.proposalText))), [],
    'the snapshot matches the committed file as the suite will trace it');
  assert.match(result.prBody, /tracer snapshot recorded/);
});

test('the issue is read from the event payload or from the API, never from a pull request', () => {
  const issue = { number: 7, body: 'text', user: { login: 'someone' }, created_at: '2026-10-06T11:03:19Z' };
  const expected = { issueNumber: 7, issueBody: 'text', userLogin: 'someone', createdAt: '2026-10-06T11:03:19Z' };
  assert.deepEqual(issueFromJSON({ action: 'opened', issue }), expected, 'issues event');
  assert.deepEqual(issueFromJSON(issue), expected, 'REST API, for a maintainer re-run');
  assert.throws(() => issueFromJSON({ ...issue, pull_request: { url: 'x' } }), /pull request/);
  assert.throws(() => issueFromJSON(null), ProposalError);
});

test('only the script\'s own validation messages are quoted back to the submitter', () => {
  assert.equal(reportableError(new ProposalError('Share link must use an official OpticalSetup address')),
    'Share link must use an official OpticalSetup address');
  assert.equal(reportableError(new ProposalError('two\nlines @someone `code`')), "two lines ＠someone 'code'",
    'one line, no mention, no code span');
  assert.equal(reportableError(new ProposalError('x'.repeat(400))).length, 300);
  assert.equal(reportableError(new TypeError('Unknown element type: <script>')), '',
    'an unexpected exception may echo scene content and is not quoted');
});

test('the CLI writes the proposal and its snapshot, reports a quotable error, and never overwrites an accepted setup', async () => {
  const script = fileURLToPath(new URL('../scripts/materialize-example-proposal.mjs', import.meta.url));
  const root = await mkdtemp(join(tmpdir(), 'opticalsetup-proposal-'));
  try {
    const run = async issue => {
      const event = join(root, 'event.json');
      const output = join(root, `output-${Math.random().toString(36).slice(2)}`);
      await writeFile(event, JSON.stringify({ action: 'opened', issue }));
      await writeFile(output, '');
      const result = spawnSync(process.execPath, [script], {
        cwd: root, encoding: 'utf8', timeout: 60000,
        env: { ...process.env, ISSUE_JSON: event, GITHUB_OUTPUT: output, RUNNER_TEMP: root },
      });
      assert.ifError(result.error);
      const outputs = Object.fromEntries((await readFile(output, 'utf8')).trim().split('\n')
        .filter(Boolean).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
      return { status: result.status, outputs };
    };
    const issue = { number: 77, body: issueBody(), user: { login: 'example-contributor' }, created_at: '2026-10-06T11:03:19Z' };

    const first = await run(issue);
    assert.equal(first.status, 0);
    assert.equal(first.outputs.issue_number, '77');
    assert.equal(first.outputs.proposal_file, 'community-submissions/issue-77.json');
    assert.equal(first.outputs.golden_file, 'test/golden/community-submissions-issue-77.json');
    assert.equal(first.outputs.error, undefined);
    const written = await readFile(join(root, first.outputs.proposal_file), 'utf8');
    const snapshot = JSON.parse(await readFile(join(root, first.outputs.golden_file), 'utf8'));
    assert.deepEqual(goldenDifferences(snapshot, goldenFor(sceneFromFile(written))), []);

    const again = await run(issue);
    assert.equal(again.status, 1, 'an accepted setup is changed by a reviewed pull request, not a re-run');
    assert.match(again.outputs.error, /already accepted as community-submissions\/issue-77\.json/);
    assert.equal(await readFile(join(root, first.outputs.proposal_file), 'utf8'), written, 'and is left as it was');

    const rejected = await run({ ...issue, number: 78, body: issueBody({ checked: false }) });
    assert.equal(rejected.status, 1);
    assert.equal(rejected.outputs.issue_number, '78', 'the submitter can still be answered');
    assert.match(rejected.outputs.error, /acknowledgement is required/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the workflow recognises the form, can be re-run, and runs the suite as CI does', async () => {
  const workflow = await readFile(new URL('../.github/workflows/example-proposal.yml', import.meta.url), 'utf8');
  const ci = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /contains\(github\.event\.issue\.body, '### OpticalSetup share link'\)/,
    'a proposal retitled to its setup name is still a proposal');
  assert.match(workflow, /workflow_dispatch:\s+inputs:\s+issue:/, 'a maintainer can run it for an issue');
  for (const step of [/node-version: (\S+)/, /python-version: (\S+)/]) {
    assert.equal(workflow.match(step)?.[1], ci.match(step)?.[1], `same ${step.source.split(':')[0]} as CI`);
  }
  assert.match(workflow, /run: npm ci/);
  assert.match(workflow, /git add "\$PROPOSAL_FILE" "\$GOLDEN_FILE"/);
  assert.match(workflow, /PROPOSAL_ERROR: \$\{\{ steps\.proposal\.outputs\.error \}\}/,
    'the reason reaches the failure comment through the environment');
  assert.doesNotMatch(workflow, /ISSUE_BODY: \$\{\{/, 'the issue body is read from a file, not pasted into the environment');
});
