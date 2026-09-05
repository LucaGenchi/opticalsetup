#!/usr/bin/env python3
"""Apply the shared loader/builder to one reviewed setup worktree.

This is an integration edit, not a Git merge. It preserves everything before
main.js's boot section except obsolete collection-only imports, all source
records, scenes, evidence notes and native physics. Regenerate pages and inspect
the resulting diff afterwards. No commits, pushes or deletions are performed.
"""
import argparse
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', required=True, type=Path)
parser.add_argument('--target', required=True, type=Path)
parser.add_argument('--write', action='store_true', help='Apply the reviewable edits; otherwise list them')
args = parser.parse_args()
source, target = args.source.resolve(), args.target.resolve()
marker = '// ---------- boot ----------\n'
source_main = (source / 'sketch/js/main.js').read_text()
target_main = (target / 'sketch/js/main.js').read_text()
if source_main.count(marker) != 1 or target_main.count(marker) != 1:
    raise SystemExit('Expected one native application boot section; review this branch manually.')
prefix, _ = target_main.split(marker, 1)
if 'state.embedMode' in source_main and 'function preserveWorkbenchInUndo()' not in prefix:
    raise SystemExit('This branch predates the current workbench embed/undo contract. '
                     'Integrate the shared foundation first; replacing only its loader would lose upstream behavior.')
obsolete = ('./paper-setups-data.js', './two-photon-setups-data.js', './collection-setups.js', './collection-loader.js')
prefix = ''.join(line for line in prefix.splitlines(keepends=True)
                 if not (line.startswith('import ') and any(path in line for path in obsolete)))
anchor = "import { initTheme } from './theme.js';\n"
if prefix.count(anchor) != 1:
    raise SystemExit('Cannot locate the common bootstrap imports.')
prefix = prefix.replace(anchor, anchor + "import { collectionSetupRequest } from './collection-loader.js';\n")
updates = {'sketch/js/main.js': prefix + marker + source_main.split(marker, 1)[1]}
for name in ['sketch/js/collection-loader.js', 'tools/build-2pp-collection.mjs',
             'tools/2pp-collection-support.mjs', 'test/2pp-shared-loader.test.js']:
    updates[name] = (source / name).read_text()
worker = (target / 'sketch/service-worker.js').read_text()
if '"./js/collection-loader.js"' not in worker:
    worker = worker.replace('  "./js/clipboard.js",', '  "./js/clipboard.js",\n  "./js/collection-loader.js",')
# An adopted loader must reach returning visitors as well as a fresh browser.
lines = worker.splitlines(keepends=True)
lines[0] = "const CACHE_NAME = 'opticalsetup-pwa-v54-2pp-linked-scenes';\n"
updates['sketch/service-worker.js'] = ''.join(lines)
for name, contents in updates.items():
    path = target / name
    if path.exists() and path.read_text() == contents:
        continue
    print(('Write ' if args.write else 'Would write ') + str(path))
    if args.write:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(contents)
print('Next: node tools/build-2pp-collection.mjs; node --test; inspect git diff.')
