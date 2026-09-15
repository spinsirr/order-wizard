# OrderCue

OrderCue is a local-first browser extension for people whose work begins after an Amazon order is delivered: follow up, track reimbursement, and prepare an item for resale without rebuilding the order in a spreadsheet.

The extension captures an order while the user is already on Amazon, turns it into a compact follow-up queue, and can carry reviewed product details into Facebook Marketplace. Optional cloud sync makes that queue available through a deliberately restricted REST API, remote MCP server, and installable agent CLI.

OrderCue is an independent product and is not affiliated with or endorsed by Amazon.

## Why this problem

Amazon remembers fulfillment. It does not remember the work a buyer still needs to do.

Frequent buyers, product testers, and small-scale resellers end up copying order numbers, product names, prices, notes, and follow-up state into spreadsheets or chat threads. That creates three recurring failures:

- context is lost between Amazon, the follow-up workflow, and Marketplace;
- manual trackers go stale because every order must be re-entered;
- giving an AI agent database or browser access grants far more authority than the task requires.

OrderCue keeps capture in context, makes local data the immediate source of truth, and exposes only five narrow agent operations: list, search, detail, status, and note.

## Take-home scope

This submission extends an existing personal order-tracking extension. I did not hide that starting point; the public commit history shows it.

The take-home work focuses on the choices that make the tool safe and presentable as a product:

- a tenant-scoped Rust application layer and restricted agent API;
- a modern, stateless MCP `2026-07-28` endpoint backed by the same application layer;
- an installable JSON CLI plus a paired Agent Skill;
- separate Cognito clients and capability ceilings for human and agent access;
- a compact side-panel redesign with loading, empty, no-result, offline, error, confirmation, and responsive states;
- a browser-safe interactive demo configured for deployment on Vercel;
- release checks that build the extension and CLI, deploy the API, and verify the result.

## Try the product

The Vercel build serves a seeded, interactive version of the real side-panel UI. Changes persist only in that browser. Extension-only actions are disabled and labeled rather than faked.

```bash
# Build the browser demo
cd apps/extension
bun install
bun run build:demo

# Inspect the demo locally
python3 -m http.server 4173 --directory .output/chrome-mv3-demo
# Open http://localhost:4173/demo.html
```

The repository-level [`vercel.json`](./vercel.json) builds the demo and routes `/` to it. `bun run build` creates the Chrome extension separately, without demo code or mocks. The live URL should be added here after the Vercel project is linked.

## Return reminders

Unreimbursed orders get a return reminder 25 calendar days after the saved order date, an urgent reminder at 28 days, and a red warning at 30 days. The panel shows a countdown, a reminder filter, and a **Start return** button that opens Amazon's Returns Center for that order. Choose the items, actual return reason, refund and return method, and submit on Amazon. Opening the flow does not mark the order as returned or reimbursed. Reimbursing or deleting an order clears its reminder.

The extension checks local orders when Chrome starts, when orders change, and hourly while Chrome runs. A toolbar badge shows the number needing attention; desktop notifications are sent once per order per stage, with simultaneous reminders grouped together. Notification history is stored only on the device. Chrome/system notification settings control whether desktop alerts appear; the panel and badge still work when notifications are disabled. The web demo only shows panel reminders.

The 30-day mark is an estimate from **order placement**, not Amazon's actual return deadline. Confirm eligibility and the deadline on Amazon. Captured English dates and ISO dates are supported; unrecognized dates cannot generate a timed reminder. Orders beyond 30 days remain flagged until reimbursed or removed. No return is submitted automatically.

## Key decisions

| Decision | Why | Cost |
| --- | --- | --- |
| Browser extension at the point of capture | The useful moment is on the Amazon order page. A separate CRUD website would recreate the copying problem. | Browser APIs require a separate web-safe demo adapter. |
| Local-first writes | Status and notes stay fast and available offline; sync is optional rather than a prerequisite. | Conflict handling needs explicit timestamps and a retry queue. |
| Last-write-wins sync | It is understandable and sufficient for single-owner order notes and status. | It is not appropriate for collaborative editing. |
| Restricted agent surface | Agents may read orders and change one status or note, but cannot create, delete, or batch mutate. | Some power-user automation is intentionally unavailable. |
| One application, three interfaces | REST, MCP, and CLI all reach the same tenant and capability checks instead of reimplementing order rules. | Each transport still needs its own protocol, auth, and conformance tests. |
| Vercel-hosted static demo | Reviewers can use the real UI without installing an unpacked extension. The product itself remains WXT because Next.js would add no value inside a Chrome side panel. | The demo uses sample data and cannot exercise Amazon page injection. |
| No generative-model call in the product | Order state is deterministic. Adding a chat box would create cost and uncertainty without removing meaningful work. | Natural-language orchestration is delegated to the user’s existing agent. |

## What I cut

- automatic status inference;
- automatic Marketplace posting;
- order creation or deletion through the agent interface;
- MCP resources, prompts, tasks, or tools beyond list/search/detail/status/note;
- multi-store scraping and collaborative workspaces;
- a bespoke web dashboard duplicating the extension.

These are not hidden roadmap promises. They are explicit scope boundaries that keep the core workflow reliable end to end.

## AI-assisted development

AI tools were used to accelerate implementation, test generation, adversarial review, UI iteration, and the browser-safe demo adapter. I retained ownership of the problem, the local-first data model, the least-privilege boundary, the decision not to add a model call, and the final scope.

The most useful AI contribution was breadth: it could inspect the extension, Rust API, CLI, and release path and surface edge cases such as hidden selections, undiscoverable note saves, and a demo page accidentally depending on extension-only browser APIs. The human work was deciding which findings mattered and which technically possible features did not belong.

See [`docs/take-home-presentation.md`](./docs/take-home-presentation.md) for the submission blurb and 20-minute demo outline.

## Architecture

### Monorepo Structure

```
apps/
├── cli/          # Rust CLI for Skill-capable agents
├── extension/    # React 19 browser extension (WXT + TailwindCSS 4)
└── server/       # Rust REST + MCP server (Axum 0.8 + MongoDB)
skills/
└── ordercue/     # Agent instructions for the CLI
```

### Tech Stack

**Extension:**
- React 19, TypeScript
- TailwindCSS 4
- React Query (TanStack Query)
- oauth4webapi for Cognito OIDC
- Zod for validation

**Server:**
- Rust with Axum 0.8
- MCP `2026-07-28` Streamable HTTP via the official Rust SDK
- MongoDB
- Cognito access-token validation with JWKS caching and scope-derived capabilities

**CLI:**
- Rust with Clap and Reqwest
- Stable JSON stdout/stderr contract for AI agents

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (package manager)
- [Rust](https://rustup.rs/)
- [Docker](https://www.docker.com/) (for MongoDB)
- [Just](https://github.com/casey/just) (command runner)

### Installation

```bash
# Install dependencies
just install

# Set up environment variables
cp apps/extension/.env.example apps/extension/.env
cp apps/server/.env.example apps/server/.env
# Edit .env files with your Cognito and MongoDB configuration
```

### Development

```bash
# Start everything (MongoDB + extension dev server + Rust server)
just dev

# Stop all dev processes
just stop
```

### Build

```bash
just build
```

## Commands

Run `just` to see all available commands:

| Command | Description |
|---------|-------------|
| `just dev` | Start MongoDB + extension dev server + Rust server |
| `just stop` | Kill all dev processes |
| `just build` | Build extension, server, and CLI |
| `just check` | Run TypeScript and Rust checks/tests |
| `just typecheck` | TypeScript type checking |
| `just test` | Vitest frontend tests (Node.js 24.5+), Rust backend and CLI tests |
| `just lint` | Biome lint |
| `just lint-fix` | Biome lint with auto-fix |
| `just format` | Biome format |
| `just bump <version>` | Synchronize release versions and refresh Cargo.lock |
| `just db` | Start MongoDB via docker-compose |
| `just db-stop` | Stop MongoDB |

Frontend automation covers business logic such as sync, account isolation, login
refresh, deletion propagation, reminder calculations and export safety. Component
rendering, copy, styles and display states are checked manually in Storybook
(`bun run storybook` from `apps/extension`).

## Environment Variables

### Extension (`apps/extension/.env`)

```
VITE_COGNITO_AUTHORITY=https://cognito-idp.<region>.amazonaws.com/<pool-id>
VITE_COGNITO_CLIENT_ID=<client-id>
VITE_COGNITO_DOMAIN=https://<domain>.auth.<region>.amazoncognito.com
VITE_API_BASE_URL=http://localhost:3000
```

### Server (`apps/server/.env`)

```
MONGODB_URI=mongodb://localhost:27017
OIDC_ISSUER=https://cognito-idp.<region>.amazonaws.com/<pool-id>
OIDC_CLIENT_ID=<extension-public-client-id>
OIDC_CLI_CLIENT_ID=<optional-cli-public-client-id>
OIDC_MCP_CLIENT_IDS=<comma-separated-pre-registered-mcp-host-client-ids>
RESOURCE_URI=https://api.example.com
MCP_ALLOWED_HOSTS=<optional-comma-separated-additions>
MCP_ALLOWED_ORIGINS=<optional-comma-separated-additions>
```

`RESOURCE_URI` must also be the Cognito resource-server identifier. Both public app clients request resource binding so access-token `aud` equals this URI.

## Agent CLI

Install from the repository:

```bash
cargo install --git https://github.com/spinsirr/order-wizard ordercue-cli --bin ordercue
```

Sign in once, then use the CLI:

```bash
ordercue auth login
ordercue auth status
ordercue orders list --limit 20
ordercue orders search "wireless headphones" --status commented
ordercue orders get <order-id>
ordercue orders status <order-id> reimbursed
ordercue orders note <order-id> "Follow up tomorrow"
ordercue auth logout
```

The default API is `https://order-wizard-api.fly.dev`; `ORDERCUE_API_URL` selects
another installation. Refresh credentials stay in the system credential store;
access tokens stay in memory. Linux login requires a working Secret Service
session. Use `auth login --no-browser` to open the URL yourself on the same computer.
For automation, `ORDERCUE_ACCESS_TOKEN` overrides saved credentials and must carry
the API audience and the three agent order scopes. The paired Skill is in `skills/ordercue`.

### Claude Code MCP

```bash
ordercue auth login --mcp
claude mcp add --transport stdio --scope user ordercue -- ordercue mcp
```

The stdio server uses its separate MCP login from the system credential store.
Manage it with `auth status --mcp` and `auth logout --mcp`. Register distinct Cognito
public clients for CLI and MCP, with authorization-code grant, PKCE and the
`orders.read`, `orders.status.write` and `orders.note.write` resource scopes.
Both use `https://order-wizard-api.fly.dev/oauth/cli/callback`; the API relays only
the code/error to a local listener, which verifies Host and one-time state.
Client IDs and issuer are published at `/.well-known/order-wizard-clients`.
Unset client IDs disable that profile; bundled MCP login requires exactly one MCP client.

## Remote MCP

The authenticated MCP endpoint is `POST <RESOURCE_URI>/mcp`. It supports only the stable `2026-07-28` protocol and exposes five tools:

```text
orders_list
orders_search
orders_get
orders_set_status
orders_set_note
```

The server is stateless: it does not create `Mcp-Session-Id` sessions or expose legacy GET/DELETE streams. Every tool call obtains the user tenant from the verified bearer token and goes through the same `OrderApplication` used by REST. Create, delete, batch mutation, and arbitrary updates are not registered as MCP tools and remain blocked by application capabilities if a caller tries to bypass discovery.

OAuth discovery is published at `/.well-known/oauth-protected-resource`. A deployed MCP host must use a pre-registered Cognito public client listed in `OIDC_MCP_CLIENT_IDS`, request `RESOURCE_URI` as its audience, and request the `orders.read`, `orders.status.write`, and `orders.note.write` scopes. Before public rollout, validate authorization code + PKCE, resource binding, refresh, and redirects end to end with each supported MCP host.

## Releases

Releases are tag-driven. First prepare and merge the version bump:

```bash
just bump 1.1.0
git add package.json Cargo.toml Cargo.lock
git commit -m "chore: release 1.1.0"
```

After that commit is merged, update local `main`, create the matching tag, and push it:

```bash
git switch main
git pull --ff-only
git tag -a v1.1.0 -m "Release v1.1.0"
git push origin v1.1.0
```

The tag must match the root package version and point to a commit on `main`. The release workflow reruns the shared CI checks, packages the production extension, builds native CLI archives for Linux, macOS, and Windows, deploys that tagged commit to Fly.io, runs a health smoke test, and then publishes the GitHub Release with SHA-256 checksums.

Configure `VITE_COGNITO_AUTHORITY`, `VITE_COGNITO_CLIENT_ID`, `VITE_COGNITO_DOMAIN`, and `VITE_API_BASE_URL` as repository secrets. `FLY_API_TOKEN` must be available to the `production` GitHub environment; deployment protection rules can be added to that environment when approval is required.

After the GitHub Release succeeds, the `Upload Chrome Web Store draft` job uploads the same extension ZIP to the existing Chrome Web Store listing using [WXT's publishing command](https://wxt.dev/guide/essentials/publishing.html). It runs only for release tags and passes `--chrome-skip-submit-review`: open the developer dashboard to review the draft and submit it for review. Uploading the ZIP does not publish an update to users.

Configure these repository secrets for the upload job:

| Secret | Value |
|--------|-------|
| `CHROME_EXTENSION_ID` | The existing Chrome Web Store item's ID |
| `CHROME_CLIENT_ID` | Google OAuth client ID for the Chrome Web Store API |
| `CHROME_CLIENT_SECRET` | The matching Google OAuth client secret |
| `CHROME_REFRESH_TOKEN` | Refresh token authorized by an account that can update the item |

These are Google credentials, separate from the application's Cognito clients. Follow [Chrome's API setup guide](https://developer.chrome.com/docs/webstore/using-api) or run `bunx --no-install wxt submit init` from `apps/extension` when credentials need to be created or renewed; keep `.env.submit` out of Git. Each new store update needs a higher extension version, including when an earlier version was uploaded manually. If the upload job fails, correct the reported issue and rerun that failed job; the completed server deployment and GitHub Release do not need to run again.

The pinned publisher is patched through Bun to require explicit `SUCCESS`; HTTP 200
with `IN_PROGRESS`, an unknown state, or a missing state fails the job. If processing
is still pending, inspect the draft in the store dashboard before retrying. The patch
and business regression must be retained until an upstream upgrade provides this
contract. The current WXT path uses API v1; [Google schedules its retirement for
2026-10-15](https://developer.chrome.com/docs/webstore/api/v1). Migration to API v2
also requires the publisher ID and the new publisher's service-account credentials;
that account configuration is separate from this local code fix.

## API Documentation

With `ENABLE_SWAGGER=true`, Swagger UI is available at `http://localhost:3000/swagger-ui`, OAuth resource metadata at `http://localhost:3000/.well-known/oauth-protected-resource`, and MCP at `http://localhost:3000/mcp`. The metadata and MCP routes remain available independently of Swagger.

## License

MIT
