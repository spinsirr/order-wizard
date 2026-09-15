# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Follow [AGENTS.md](AGENTS.md) for project workflow rules, including the disabled `/ship` skill.

## Project Overview

OrderCue - A browser extension for tracking Amazon orders with cloud sync support.

## Commands

```bash
# Run `just` to see all available commands

# Development
just dev          # Start MongoDB + extension dev server + Rust server
just stop         # Kill all dev processes

# Build
just build        # Build extension + Rust server and CLI

# Code Quality
just check        # Run TypeScript and Rust checks/tests
just ci           # Alias for check
just typecheck    # TypeScript check
just test         # Vitest + Rust tests
just lint         # Biome lint
just lint-fix     # Biome lint with auto-fix
just format       # Biome format

# Database
just db           # Start MongoDB via docker-compose
just db-stop      # Stop MongoDB

# Other
just install      # Install dependencies
just setup        # Setup git hooks
just clean        # Clean all build artifacts
just bump X.Y.Z   # Synchronize release versions and refresh Cargo.lock
```

## Architecture

### Frontend component debugging

Run `bun run storybook` from `apps/extension` and open `http://127.0.0.1:6006`.
Storybook renders the actual cards and order list with isolated mock data, plus a workflow designer prototype.
Use the story sidebar to switch scenarios, Controls to change inputs, Actions to inspect events,
and the viewport toolbar for 320/400/480px side panels. List changes live in memory and reset
when changing stories or reloading the canvas; they never use extension storage or cloud sync.

Stories live in `apps/extension/src/stories`. The Storybook-only Vite alias replaces
`@/hooks/useOrders` with `src/stories/mockOrders.tsx`; production imports stay unchanged.
Run `bun run typecheck:storybook` and `bun run build-storybook` to check this workbench.

Automated frontend tests cover business behavior: order sync, account isolation,
login/refresh, deletion propagation, return reminder calculations and export safety.
Keep protocol validation and Marketplace data/retry tests. Do not add tests for
component rendering, copy, styles, labels or display states; inspect those manually
in Storybook. Testing Library may drive a business hook/provider without asserting
its rendered UI.

Tests use Vitest, Testing Library and jsdom. Run `bun run test` or
`bun run test:watch` inside `apps/extension`. Node.js 24.5+ is required: the test
environment uses native Web Locks from `node:worker_threads` and the existing
`@webext-core/fake-browser` package for extension APIs. Tests inherit the strict
TypeScript rules through `tsconfig.test.json` and are included in `just check`
and CI. In Storybook, inspect Orders/Card (including note Controls while editing),
Orders/List (search and return queue states), and Marketplace/Preview (editing,
photo selection, no photos and Escape). Storybook remains the interactive UI workbench.

`Workflow/Settings` contains an editable state-machine example and a blank starting point.
The Storybook-only prototype lives in `src/demo/state-machine-prototype`: React Flow edits
states, the initial state, multiple final states, and named directed transitions; XState
runs exactly those transitions in a mock order. Create connections by dragging from a state’s
bottom handle to another state’s top handle; drag selected edge endpoints to reconnect.
Connection endpoints have no form selectors. Final states have no outgoing actions.
Names do not imply reimbursement or other side effects. Invalid drafts remain editable,
and unreachable states or non-final dead ends are flagged. This is an in-memory design
experiment, not the production order schema.

The full frontend runs with `bun run dev:workflow` at
`http://127.0.0.1:3001/src/entrypoints/demo/index.html`; its navigation links to Storybook.
`bun run build:demo` builds the Vercel preview; extension builds exclude the demo and its mocks.
`Marketplace/Preview` renders the actual listing dialog with mock data. In the extension,
WXT mounts `listing-preview.html` in an isolated iframe; a private MessageChannel carries
the draft and confirmed result. Business React imports `components/ui`; Radix stays inside
that shared layer. Status display names come from `ORDER_STATUS_LABELS`.

### Monorepo Structure
- **apps/extension/** - React 19 browser extension (Vite + TailwindCSS 4)
- **apps/server/** - Rust API (Axum 0.8 + MongoDB)
- **apps/cli/** - Installable Rust CLI with a stable JSON contract
- **skills/ordercue/** - Agent instructions paired with the CLI
- Package manager: Bun (workspaces in `apps/*`)
- Releases are created only from matching `vX.Y.Z` tags on `main`; that workflow builds all user artifacts and deploys the server from the tagged commit.

### Authentication Flow
1. Cognito OIDC authorization code flow via oauth4webapi
2. Authorization requests bind tokens to `RESOURCE_URI` and request custom order scopes
3. Extension receives an access token; CLI and stdio MCP use separate public app clients
   and system credential-store profiles. Access tokens remain in memory.
4. Server validates RS256, issuer, expiry, `token_use=access`, resource audience, and client allowlist
5. Final token scopes are intersected with the app client's maximum capabilities to construct `Principal`

### Canonical boundaries

- `apps/extension/src/entrypoints` contains WXT background, content, sidepanel,
  options, listing-preview and demo entrypoints. Configure the manifest in
  `wxt.config.ts`; do not edit generated manifests.
- `schemas/order.ts` is the Order contract. API adapters derive their wire schemas
  from it; normalize transport nulls at the boundary. IDs are opaque strings;
  extension-created IDs use UUIDs. Missing product images are represented by `''`.
- `background/orderStorage.ts` owns local order/outbox writes. All normal callers
  use `LocalStorageRepository` or the typed broker commands. The Web Lock and one
  `chrome.storage.local.set` commit protect the entire transaction.
- `authStorage.ts` owns cross-panel credential commits under Web Locks and expected
  revisions/tokens; `authFlow.ts` uses oauth4webapi for authorization and refresh.
  AuthProvider consumes committed storage snapshots. HTTP clients bind a token to
  each sync operation; never mutate a global bearer token.
- `useOrders.ts` reads the account's local replica and submits mutations. Await the
  broker, then invalidate TanStack Query. Do not duplicate persistence with whole
  array optimistic rollback. Present query and mutation errors to the user.
- `lib/syncQueue.ts` is a durable outbox. TanStack Query owns network retries and
  online/offline scheduling. Batch recovery uses one `enqueue(orders)` command.
  ACK only the operation IDs sent; failed and newer writes stay pending.
- `apps/server/src/application` owns tenant/capability enforcement for REST, MCP
  and CLI requests. Its repository port has MongoDB and in-memory implementations.
  Use atomic field patches for commands, and full snapshots only for replication.
- `apps/server/src/lib.rs` composes Axum, auth, CORS and rate limiting; `main.rs`
  starts the server. `routes` owns REST/OAuth discovery and `mcp` owns MCP transport.

### Replication contract

Orders are offline first in `chrome.storage.local`; MongoDB is the shared replica.
Identity is `(userId, orderNumber)`, with a canonical persisted ID. Account switches
must never reassign owned records. Anonymous records can join the first signed-in
account; collisions remain anonymous.

Compare `updatedAt`, falling back to `createdAt`, as RFC3339 instants with nanosecond
precision. Rust uses `time`; TypeScript uses `@js-temporal/polyfill`. Server commands
and local edits advance `max(clock, previous + 1ns)`. An explicit stale PATCH version
returns HTTP 409. Reapply only requested fields when a CAS must retry. Cloud wins
an equal-version pull; older snapshots cannot overwrite local data.

Deletion persists a tombstone with a monotonically advanced version. Ordinary
edits do not change deleted orders. Re-capturing a deleted Amazon order intentionally
restores it with a newer version and its existing identity. Retain unowned legacy
delete queue entries without submitting them under a signed-in account.

Production statuses remain `uncommented → commented → comment_revealed → reimbursed`.
Custom state machines are a Storybook prototype, not a production schema migration.

## Code conventions

- Use `@/` imports inside extension source. Business React imports shared
  `components/ui`; shadcn controls reuse Radix behavior there.
- Prefer existing libraries and canonical helpers. Keep components and modules
  focused; avoid speculative abstractions and duplicated contracts.
- TypeScript 7 runs strict checks for extension, Storybook, business tests and root
  scripts. Biome lint/format errors and warnings block CI. Do not weaken rules to
  make a change pass. Root scripts use the root tsconfig and Bun types.
- Rust uses `?` with application/AppError types. Clippy warnings block CI.
- Pure UI behavior is checked manually in Storybook, not automated render/copy/style
  tests. Business hooks/providers may use Testing Library without UI assertions.
- Reuse PapaParse `escapeFormulae`, ExcelJS and jsPDF for safe exports. Do not build
  custom CSV/XLSX/PDF encoders.

## Validation and releases

`just check` runs version consistency, all TypeScript checks, Biome, design guards,
business Vitest, Rust fmt/Clippy and Rust tests. CI additionally builds extension and
Storybook and runs ignored Mongo regression tests against MongoDB 8.2.

Use `MONGODB_TEST_URI=mongodb://127.0.0.1:27017 just test-mongo` only with a disposable
local test instance. Tests create isolated collections and remove them afterwards.

`scripts/set-version.ts` is the sole version writer. `just bump X.Y.Z` updates root
package.json, Cargo workspace version and Cargo.lock. WXT reads the root version.
Pre-commit validates staged versions and runs checks without rewriting or staging.
Release tags must match versions and point to main; never move existing tags.
See README and `.github/workflows/release.yml` for credential and release setup.

The Chrome draft uploader uses WXT's pinned publisher. Its Bun patch requires an
explicit SUCCESS result; pending/unknown results fail the job. The business test
loads the actual WXT dependency and mocks HTTP; it does not upload to Google.
Upload does not submit review or publish the extension. API v1 credential migration
must be finished before Google's announced 2026-10-15 retirement.

Use conventional commits (`feat`, `fix`, `refactor`, `docs`, `chore`, `test`). Do not
add generated-by or AI co-author attribution to commits, issues or PRs.

## Configuration

- Extension: `VITE_COGNITO_AUTHORITY`, `VITE_COGNITO_CLIENT_ID`,
  `VITE_COGNITO_DOMAIN`, `VITE_API_BASE_URL` (see `.env.example`).
- Server: `MONGODB_URI`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLI_CLIENT_ID`,
  `OIDC_MCP_CLIENT_IDS`, `RESOURCE_URI`; capability limits are per app client.
- Set `ENABLE_SWAGGER=true` for local Swagger/OpenAPI endpoints. Public OAuth
  metadata and MCP do not require Swagger. See README for endpoint contracts.
- The unique MongoDB index is `(user_id, order_number)`; application startup owns
  index creation. Never weaken tenant filtering to work around duplicate data.
