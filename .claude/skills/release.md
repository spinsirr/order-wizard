---
name: release
description: OrderCue version and tag-driven release workflow.
---

# Release workflow

The repository's `/ship` skill is disabled; follow AGENTS.md. Never start an independent reviewer automatically.

1. Run `just bump X.Y.Z`. The existing `scripts/set-version.ts` is the only version writer. It updates root package.json, Cargo workspace version and Cargo.lock; WXT reads the root version.
2. Run `just check` and review the intended diff. The pre-commit hook validates staged versions and runs checks; it never stages or rewrites files.
3. Commit the intended files and merge the reviewed PR into main using the user's authorized workflow.
4. When a release is authorized, create and push a new matching `vX.Y.Z` tag on main. Existing release tags are immutable; never delete or move one to retry a release.
5. `.github/workflows/release.yml` validates the tag, runs CI, builds the extension and CLI artifacts, deploys the tagged server, and creates the GitHub Release.

Chrome Web Store submission uses the release ZIP and WXT's pinned API v2 publisher. Configure `CHROME_EXTENSION_ID`, `CHROME_PUBLISHER_ID`, `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL`, and `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY` as repository secrets. The service account must be linked to the publisher. After the tag-driven GitHub Release, WXT uploads and submits for review; Google publishes automatically after approval. The publisher requires upload SUCCEEDED and propagates API failures. A successful job means submitted for review, not approved or published. Never automatically cancel an existing review; inspect the dashboard before retrying a failed submission.

Use a new version for new code. For a transient CI failure, rerun the existing job against the same tagged commit.
