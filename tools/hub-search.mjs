// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Markup of the search box shared by the wiki and calculators hubs. The box
// starts hidden and sketch/js/hub-search.js reveals and drives it; `docs` are
// search documents (see sketch/js/search.js) whose `id` matches the
// data-search-key of a card inside the element with id `groupsId`.

const esc = value => String(value).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function hubSearchBox({ base, placeholder, label, groupsId, resultsClass, docs }) {
  // "<" escaped so no text in the index can close the script element early.
  const index = JSON.stringify(docs).replace(/</g, '\\u003c');
  return {
    box: `<div class="hub-search" data-hub-search data-groups="${esc(groupsId)}" data-results="hubSearchResults" data-index="hubSearchIndex" hidden>
        <input type="search" placeholder="${esc(placeholder)}" aria-label="${esc(label)}" autocomplete="off" spellcheck="false">
        <kbd aria-hidden="true">/</kbd>
        <span class="hub-search-status" data-search-status aria-live="polite"></span>
      </div>`,
    results: `<div id="hubSearchResults" class="${esc(resultsClass)} hub-search-results" hidden></div>`,
    scripts: `<script type="application/json" id="hubSearchIndex">${index}</script>
<script type="module" src="${base}/sketch/js/hub-search.js"></script>`,
  };
}
