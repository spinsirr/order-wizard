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

Chrome Web Store upload uses the release ZIP and the established WXT publisher. The `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, and `CHROME_REFRESH_TOKEN` repository secrets must be configured. Upload runs after the tag-driven GitHub Release and skips submission for review. The job requires an explicit SUCCESS upload state; pending, unknown and rejected uploads fail. A successful upload does not mean that the store has reviewed or published it.

Use a new version for new code. For a transient CI failure, rerun the existing job against the same tagged commit.
