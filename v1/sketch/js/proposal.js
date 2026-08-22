// GitHub handoff for community setup proposals. Authentication and final
// submission stay on GitHub; the static app only prepares a prefilled form.

const REPOSITORY = 'LucaGenchi/optics-sketch';
const ISSUE_TEMPLATE = 'example-proposal.yml';

// GitHub documents that overlong issue URLs can be rejected with HTTP 414 but
// does not publish a fixed limit. Keep the automatic handoff conservative.
export const MAX_PROPOSAL_ISSUE_URL_CHARS = 7_500;

function requiredText(value, label, maxLength) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  if (text.length > maxLength) throw new Error(`${label} is too long`);
  return text;
}

function optionalText(value, label, maxLength) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.length > maxLength) throw new Error(`${label} is too long`);
  return text;
}

function validateShareURL(value) {
  let url;
  try { url = new URL(value); } catch (_) { throw new Error('Could not create the setup link'); }
  if (url.protocol !== 'https:' || !url.hash.startsWith('#sketch=')) {
    throw new Error('Could not create the setup link');
  }
  return url.toString();
}

export function buildExampleProposalIssueURL({ name, description, reference, shareURL }) {
  const setupName = requiredText(name, 'Setup name', 100).replace(/\s+/g, ' ');
  const demonstration = requiredText(description, 'Description', 2_000);
  const referenceText = optionalText(reference, 'Reference', 500);
  const setupLink = validateShareURL(shareURL);
  const issue = new URL(`https://github.com/${REPOSITORY}/issues/new`);
  issue.searchParams.set('template', ISSUE_TEMPLATE);
  issue.searchParams.set('title', `[Example proposal] ${setupName}`);
  issue.searchParams.set('setup_name', setupName);
  issue.searchParams.set('demonstration', demonstration);
  issue.searchParams.set('setup_link', setupLink);
  if (referenceText) issue.searchParams.set('reference', referenceText);
  if (issue.toString().length > MAX_PROPOSAL_ISSUE_URL_CHARS) {
    throw new Error('This setup is too large for the automatic GitHub handoff. Save the JSON and open an example proposal manually.');
  }
  return issue.toString();
}
