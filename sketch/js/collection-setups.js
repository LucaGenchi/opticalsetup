// Safe resolver for paper-specific native scenes. Collection pages use the
// default locked preview; `collectionMode=edit` loads the same file into the
// ordinary editable workbench. IDs are slugs rather than paths so a query
// string can never make the app fetch an arbitrary local resource.

const COLLECTION_SETUP_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function collectionSetupPath(id) {
  if (typeof id !== 'string' || !COLLECTION_SETUP_ID.test(id)) return null;
  return `../collections/2pp/setups/${id}.json`;
}
