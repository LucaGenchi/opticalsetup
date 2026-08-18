# Reviewing and publishing community setups

Audience: repo maintainers with merge rights on `main` (currently Luca Genchi and Bertona88, or any future admin). This is the manual, github.com-only protocol — no local checkout or admin bypass required for the normal case.

## How it works, end to end

1. A user submits a setup, either through the app's **Propose setup** button or a GitHub issue. This opens a GitHub issue with the scene attached.
2. The **"Materialize example proposal"** workflow parses, validates, traces, and exports that scene, then opens a pull request titled **"Propose community setup: `<name>`"** that adds one file: `community-submissions/issue-N.json`.
3. **Merging that PR is the approval.** There is no separate status field or flag to flip — if you merge it, it's approved; if you close it instead, it's rejected. Nothing else happens on close.
4. Merging triggers the **"Publish approved community setups"** workflow, which runs `node tools/build-community.mjs` (deterministic — same input always produces the same output) and opens a *second* pull request titled **"Publish approved community setups"**, containing only the two generated files it produced: `community/<slug>/index.html` and `sketch/js/community-data.js`.
5. **Merging that second PR is what actually makes the setup go live** — it's what appears on the public Community page and in the app's "From the community" dropdown.

Two merges, both on github.com, both just the ordinary green **Merge pull request** button. No repository settings, admin overrides, or local terminal needed for the normal path.

(Why two PRs instead of one: `main` requires a reviewed pull request with no bypass for any bot identity, on purpose — publishing should never get a direct-push shortcut, regardless of what any current or future workflow tries to do. Every touch to `main` costs a human click.)

## Step-by-step

### Step 1 — review and approve the submission

1. Open the [Pull Requests tab](https://github.com/LucaGenchi/optics-sketch/pulls).
2. Open the PR titled **"Propose community setup: ..."**.
3. Read the description (it links back to the source GitHub issue and the submitter's write-up) and check the **Files changed** tab for the raw scene JSON.
4. Optional — sanity-check it visually before merging; see "Verifying locally" below.
5. **Approve:** click **Merge pull request** (the default "Create a merge commit" option is fine).
6. **Reject:** click **Close pull request** instead. Nothing else is required — no generated files are ever touched by an unmerged proposal, so there's nothing to clean up.

### Step 2 — publish the generated pages

1. Give it a minute or two after merging Step 1 for the "Publish approved community setups" workflow to run. You can watch it on the [Actions tab](https://github.com/LucaGenchi/optics-sketch/actions) if you want.
2. A new PR titled **"Publish approved community setups"** appears automatically.
3. Open it and check the **Files changed** tab — it should touch exactly `community/<slug>/index.html` and `sketch/js/community-data.js`, nothing else. There's nothing to hand-edit; it's pure generated output.
4. Click **Merge pull request**. The setup is now live.

### If the "Publish" PR never shows up

Check the [Actions tab](https://github.com/LucaGenchi/optics-sketch/actions) for a failed "Publish approved community setups" run and read its log. If the workflow itself is broken and you need to publish manually from a local checkout:

```bash
git checkout main && git pull
node tools/build-community.mjs
git checkout -b publish-community/manual
git add community sketch/js/community-data.js
git commit -m "Publish approved community setups"
git push -u origin publish-community/manual
gh pr create --base main --fill
```

Then merge that PR from the website exactly as in Step 2.

## Verifying a submission locally before merging (optional)

```bash
git fetch origin pull/<PR-number>/head:review-pr
git checkout review-pr
npm test
node tools/build-community.mjs
node serve.mjs   # open http://localhost:5182/community/<slug>/
```
