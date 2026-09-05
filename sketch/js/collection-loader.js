// Native 2PP scenes share one URL contract. Explicit flags keep editable
// workbenches separate from preview pages, which must never replace autosave.
export function collectionSetupRequest(params = new URLSearchParams()) {
  const ids = ['paper', 'setup', 'collection'].flatMap(key => params.getAll(key));
  if (!ids.length || ids.some(id => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 80)
    || new Set(ids).size !== 1) return null;
  const explicitPreview = ['embed', 'locked', 'preview'].some(key =>
    params.getAll(key).some(value => value === '' || value === '1'))
    || params.get('collectionMode') === 'preview';
  const explicitEdit = params.get('edit') === '1' || params.get('collectionMode') === 'edit';
  return {
    id: ids[0],
    path: `../collections/2pp/setups/${ids[0]}.json`,
    // Bare historical URLs often appear in iframes. Require an explicit edit
    // action; a conflicting preview flag always retains the locked mode.
    editable: explicitEdit && !explicitPreview,
  };
}
