import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildExampleProposalIssueURL,
  MAX_PROPOSAL_ISSUE_URL_CHARS,
} from '../sketch/js/proposal.js';

const shareURL = 'https://opticalsetup.com/v1/sketch/#sketch=j.eyJhcHAiOiJvcHRpY3MyZCJ9';

test('example proposal handoff prefills the dedicated GitHub issue form', () => {
  const issue = new URL(buildExampleProposalIssueURL({
    name: '  Balanced   interferometer ',
    description: 'Shows two paths recombining at a beamsplitter.',
    shareURL,
  }));
  assert.equal(issue.origin + issue.pathname, 'https://github.com/LucaGenchi/optics-sketch/issues/new');
  assert.equal(issue.searchParams.get('template'), 'example-proposal.yml');
  assert.equal(issue.searchParams.get('title'), '[Example proposal] Balanced interferometer');
  assert.equal(issue.searchParams.get('setup_name'), 'Balanced interferometer');
  assert.equal(issue.searchParams.get('demonstration'), 'Shows two paths recombining at a beamsplitter.');
  assert.equal(issue.searchParams.get('setup_link'), shareURL);
  assert.equal(issue.searchParams.has('reference'), false);
});

test('example proposal handoff includes an optional reference when provided', () => {
  const issue = new URL(buildExampleProposalIssueURL({
    name: 'Balanced interferometer',
    description: 'Shows two paths recombining at a beamsplitter.',
    reference: '  Hecht, Optics, 5th ed., §9.4  ',
    shareURL,
  }));
  assert.equal(issue.searchParams.get('reference'), 'Hecht, Optics, 5th ed., §9.4');
});

test('example proposal handoff omits a whitespace-only reference', () => {
  const issue = new URL(buildExampleProposalIssueURL({
    name: 'Balanced interferometer',
    description: 'Shows two paths recombining at a beamsplitter.',
    reference: '   ',
    shareURL,
  }));
  assert.equal(issue.searchParams.has('reference'), false);
});

test('example proposal handoff rejects missing fields and non-share links', () => {
  assert.throws(() => buildExampleProposalIssueURL({ name: '', description: 'Useful setup', shareURL }), /name is required/i);
  assert.throws(() => buildExampleProposalIssueURL({ name: 'Setup', description: '', shareURL }), /description is required/i);
  assert.throws(() => buildExampleProposalIssueURL({
    name: 'Setup', description: 'Useful setup', shareURL: 'https://opticalsetup.com/v1/sketch/',
  }), /setup link/i);
});

test('example proposal handoff rejects an overlong reference', () => {
  assert.throws(() => buildExampleProposalIssueURL({
    name: 'Setup',
    description: 'Useful setup',
    reference: 'a'.repeat(501),
    shareURL,
  }), /reference is too long/i);
});

test('example proposal handoff fails clearly before GitHub returns an overlong URL', () => {
  assert.throws(() => buildExampleProposalIssueURL({
    name: 'Large setup',
    description: 'Demonstrates a deliberately large test scene.',
    shareURL: `https://opticalsetup.com/v1/sketch/#sketch=j.${'a'.repeat(MAX_PROPOSAL_ISSUE_URL_CHARS)}`,
  }), /too large/i);
});
