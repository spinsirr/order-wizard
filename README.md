# Amazon Order Wizard

An offline-first Amazon order tracker with a Rust API and agent-safe CLI.

## Features

- **Order Tracking** - Save and track Amazon orders with status progression
- **Offline-First** - Works without internet, syncs when connected
- **Cloud Sync** - Optional sync across devices via AWS Cognito authentication
- **Status Workflow** - Track orders through: Uncommented → Commented → Comment Revealed → Reimbursed
- **Export** - Export orders to CSV
- **Search & Filter** - Fuzzy search and filter by status
- **Agent Access** - Installable JSON CLI and Claude Code MCP for list, search, detail, status, and note operations
- **Least Privilege** - CLI/agent credentials cannot create, delete, or batch-mutate orders

## Return reminders

Unreimbursed orders get a return reminder 25 calendar days after the saved order date, an urgent reminder at 28 days, and a red warning at 30 days. The panel shows a countdown, a reminder filter, and a **Start return** button that opens Amazon's Returns Center for that order. Choose the items, actual return reason, refund and return method, and submit on Amazon. Opening the flow does not mark the order as returned or reimbursed. Reimbursing or deleting an order clears its reminder.

The extension checks local orders when Chrome starts, when orders change, and hourly while Chrome runs. A toolbar badge shows the number needing attention; desktop notifications are sent once per order per stage, with simultaneous reminders grouped together. Notification history is stored only on the device. Chrome/system notification settings control whether desktop alerts appear; the panel and badge still work when notifications are disabled.

The 30-day mark is an estimate from **order placement**, not Amazon's actual return deadline. Confirm eligibility and the deadline on Amazon. Captured English dates and ISO dates are supported; unrecognized dates cannot generate a timed reminder. Orders beyond 30 days remain flagged until reimbursed or removed. No return is submitted automatically.

## Architecture

### Monorepo Structure

```
apps/
├── cli/          # Rust CLI for Skill-capable agents
├── extension/    # React 19 browser extension (WXT + TailwindCSS 4)
└── server/       # Rust API (Axum 0.8 + MongoDB)
skills/
└── order-wizard/ # Agent instructions for the CLI
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
| `just lint` | Biome lint |
| `just lint-fix` | Biome lint with auto-fix |
| `just format` | Biome format |
| `just bump <version>` | Synchronize release versions and refresh Cargo.lock |
| `just db` | Start MongoDB via docker-compose |
| `just db-stop` | Stop MongoDB |

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
# Optional: set after registering a separate CLI public app client
# OIDC_CLI_CLIENT_ID=<cli-public-client-id>
# OIDC_MCP_CLIENT_IDS=<mcp-public-client-id>
RESOURCE_URI=https://api.example.com
```

`RESOURCE_URI` is the canonical API URL without a trailing slash and must also be the Cognito resource-server identifier. Extension, CLI, and MCP request resource binding so access-token `aud` equals this URI.

CLI and MCP each use a separate public app client. Their allowlists are optional: unset or blank values disable that client profile without preventing extension login. Neither may reuse the extension client ID. `OIDC_MCP_CLIENT_IDS` accepts comma-separated IDs; the bundled MCP login currently requires exactly one. The server publishes these public client IDs and issuer at `/.well-known/order-wizard-clients`.

## Agent CLI

Install from the repository:

```bash
cargo install --git https://github.com/spinsirr/order-wizard order-wizard-cli --bin order-wizard
```

Sign in once, then use the CLI:

```bash
order-wizard auth login
order-wizard auth status
order-wizard orders list --limit 20
order-wizard orders search "wireless headphones" --status commented
order-wizard orders get <order-id>
order-wizard orders status <order-id> reimbursed
order-wizard orders note <order-id> "Follow up tomorrow"
order-wizard auth logout
```

The default API is `https://order-wizard-api.fly.dev`. `ORDER_WIZARD_API_URL` selects another installation and keeps its credentials separate. Tokens are saved in the system credential store (macOS Keychain, Windows Credential Manager, or Linux Secret Service), refreshed automatically, and never printed. Linux browser login requires a working Secret Service session. `auth login --no-browser` prints the login URL without opening it. Sign in using a browser on the same computer as the CLI.

For automation, `ORDER_WIZARD_ACCESS_TOKEN` overrides saved credentials. Supply an access token from an allowed agent client with the API audience and the three order scopes. Keep tokens out of chat and checked-in configuration. The paired agent Skill is in `skills/order-wizard`.

### Claude Code MCP

The CLI also provides a local stdio MCP server. Give it its own login, then register it in Claude Code:

```bash
order-wizard auth login --mcp
claude mcp add --transport stdio --scope user order-wizard -- order-wizard mcp
```

Restart Claude Code or reconnect through `/mcp`. It exposes `orders_list`, `orders_search`, `orders_get`, `orders_set_status`, and `orders_set_note`. It reads the MCP profile from the system credential store on each operation, so refreshed credentials are available without copying tokens into Claude configuration. Use `auth status --mcp` and `auth logout --mcp` to manage that login separately.

The API also serves stateless Streamable HTTP MCP at `/mcp` for pre-registered clients supporting protocol `2026-07-28`. The Claude Code stdio transport negotiates the SDK's supported versions independently. HTTP MCP validates Host and Origin; the canonical API host/origin are allowed automatically. `MCP_ALLOWED_HOSTS` and `MCP_ALLOWED_ORIGINS` can add comma-separated exact entries for another deployment address.

### Cognito client setup

Create distinct public clients without client secrets for CLI and MCP. Enable only authorization-code grant and these custom scopes:

- `<RESOURCE_URI>/orders.read`
- `<RESOURCE_URI>/orders.status.write`
- `<RESOURCE_URI>/orders.note.write`

Register the exact HTTPS callback `<RESOURCE_URI>/oauth/cli/callback` for both clients. The CLI uses PKCE S256 and one-time state; the API forwards only the authorization code or denial to the originating `127.0.0.1` listener. The listener checks its Host and state before exchanging the code directly with Cognito using the original HTTPS callback and PKCE verifier. OAuth traffic never follows unexpected HTTP redirects, and callback responses disable caching and referrers. Cognito does not need a registered HTTP loopback callback.

Production clients use 15-minute access/ID tokens, five-day refresh tokens, token revocation, and generic user-existence errors. SDK password and SRP flows are disabled. Refresh rotation remains disabled because separate CLI/MCP processes can refresh concurrently. Logout revokes the refresh token and removes local credentials; it does not clear the browser's Cognito session. Previously issued access tokens remain valid until expiry under the API's offline JWT verification.

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

Store the separate public client IDs as `OIDC_CLI_CLIENT_ID` and `OIDC_MCP_CLIENT_IDS` GitHub Actions secrets (repository or `production` environment). Optional `MCP_ALLOWED_HOSTS` and `MCP_ALLOWED_ORIGINS` secrets use the same names. Before deployment, the workflow stages configured values as Fly runtime secrets; they take effect with the tagged deployment. GitHub Secrets are not automatically available to the running server. Omitting a GitHub secret preserves the existing Fly value.

## API Documentation

When running the server, Swagger UI is available at `http://localhost:3000/swagger-ui`.

## License

MIT
