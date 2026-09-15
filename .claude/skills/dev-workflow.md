---
name: dev-workflow
description: OrderCue local development and validation commands.
---

# OrderCue development

Follow AGENTS.md and CLAUDE.md. `/ship` is disabled; independent review is not automatic.

- `just dev`: local MongoDB, extension dev server and Rust API.
- `just check`: TypeScript, lint/format, design guard, business tests and Rust checks.
- `just build`: extension and Rust server/CLI builds; no production deployment.
- `bun run dev:workflow` in `apps/extension`: isolated full frontend demo on port 3001.
- `bun run storybook`: interactive UI workbench on port 6006.
- `bun run build-storybook`: validate workbench compilation.
- `MONGODB_TEST_URI=... just test-mongo`: real adapter regression on disposable MongoDB.

Configure extension matches, permissions and manifest metadata in `wxt.config.ts` and
WXT entrypoints, not a generated manifest. Reload the built unpacked extension from
`.output/chrome-mv3` in Chrome when checking extension integration.

REST handlers live in `apps/server/src/routes`, domain behavior in `application`,
composition in `lib.rs`. Validate changes locally. Production releases use the
matching version tag on main and `.github/workflows/release.yml`; see the release
workflow notes. A local edit or build is not authorization to deploy.

Pure UI rendering, copy, styles and presentation are checked in Storybook. Preserve
business tests for sync, account ownership, authentication, deletion, reminders,
exports, data/protocol validation and Marketplace retries.
