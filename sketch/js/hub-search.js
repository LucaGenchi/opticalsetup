// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The search box of the wiki and calculators hubs. The page generators write
// the box (hidden until this runs, so a page without scripts shows no dead
// control), a JSON index of search documents keyed like the cards, and the
// cards themselves; this ranks the index with the palette's own search and
// lists the matching cards, best first, in place of the categories.
//
// Enter opens the best match, "/" focuses the box, and ?q= in the address
// starts the page with that search, so another page can link to one.
import { prepareSearchDocument, rankSearch } from './search.js';

function attach(box) {
  const input = box.querySelector('input[type="search"]');
  const groups = document.getElementById(box.dataset.groups);
  const results = document.getElementById(box.dataset.results);
  const status = box.querySelector('[data-search-status]');
  const indexNode = document.getElementById(box.dataset.index);
  if (!input || !groups || !results || !indexNode) return;
  const cards = new Map([...groups.querySelectorAll('[data-search-key]')].map(card => [card.dataset.searchKey, card]));
  const documents = JSON.parse(indexNode.textContent)
    .filter(doc => cards.has(doc.id))
    .map(doc => prepareSearchDocument(doc));
  const total = cards.size;

  const update = () => {
    const q = input.value.trim();
    const ranked = q ? rankSearch(documents, q) : [];
    results.replaceChildren(...ranked.map(({ doc }) => cards.get(doc.id).cloneNode(true)));
    groups.hidden = Boolean(q);
    results.hidden = !q;
    if (status) {
      status.textContent = !q ? '' : ranked.length
        ? `${ranked.length} of ${total}`
        : 'No match. Try a component, an acronym or a quantity.';
    }
  };
  input.addEventListener('input', update);
  input.addEventListener('keydown', event => {
    const first = results.hidden ? null : results.querySelector('a[href]');
    if (event.key !== 'Enter' || !first) return;
    event.preventDefault();
    location.href = first.href;
  });
  document.addEventListener('keydown', event => {
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    event.preventDefault();
    input.focus();
  });

  box.hidden = false;
  const initial = new URLSearchParams(location.search).get('q');
  if (initial) { input.value = initial; update(); }
}

document.querySelectorAll('[data-hub-search]').forEach(attach);
