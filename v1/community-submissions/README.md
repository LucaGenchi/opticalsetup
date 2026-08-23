# Community setup submissions

Files in this directory are accepted community setups created from public GitHub example-proposal issues. They preserve the normalized OpticalSetup scene, contributor attribution, source issue, submission time, and a scene checksum.

The proposal workflow creates a normal pull request containing the normalized submission. A maintainer reviews that single pull request: merging approves the setup and triggers a publishing workflow that generates its page under `community/<slug>/`, updates the Community hub, and updates the app manifest; closing rejects it. There are no status fields or generated files to edit by hand. Unlike `Examples/`, these setups are not vetted for pedagogical accuracy — they show real usage, not curated teaching material.

The proposal workflow treats all issue text and scene data as untrusted input. It bounds payload size and object counts, parses with the current component registry, traces the scene, checks finite SVG output, and runs the full repository test suite before opening the pull request.

Repository setup: the proposal workflow requests `contents: write`, `issues: write`, and `pull-requests: write`; the publishing workflow requests `contents: write`. The repository owner must also allow GitHub Actions to create pull requests under **Settings → Actions → General → Workflow permissions**. If that repository-level switch is off, validation can pass but GitHub will refuse the PR creation step.
