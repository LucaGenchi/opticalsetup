# Examples

Each subfolder here is a category shown in the app's "Examples…" dropdown
(the folder name *is* the category label). Each `.json` file inside is one
example (the filename, minus `.json`, *is* the example name).

## Adding an example

1. Build the sketch in the app (opticalsetup.com, or `node serve.mjs` locally).
2. Click **Save** — this downloads a `.json` file in exactly the format
   these folders expect.
3. Rename it to whatever you want shown in the dropdown, and drop it into
   the right category folder here (create a new folder for a new category).
4. Regenerate the manifest the app actually reads:
   ```bash
   node tools/build-examples.mjs
   ```
   This validates every file against the real component registry — a typo'd
   element type or malformed file fails loudly here instead of breaking the
   dropdown at runtime.
5. Commit both the new `.json` file and the regenerated
   `sketch/js/examples-data.js`.

## Removing or renaming an example

Delete or rename the `.json` file, then re-run `node tools/build-examples.mjs`
and commit the updated manifest.
