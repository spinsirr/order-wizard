# Amazon Order Wizard

A browser extension for tracking Amazon orders with cloud sync support.

## Features

- **Order Tracking** - Save and track Amazon orders with status progression
- **Offline-First** - Works without internet, syncs when connected
- **Cloud Sync** - Optional sync across devices via AWS Cognito authentication
- **Status Workflow** - Track orders through: Uncommented → Commented → Comment Revealed → Reimbursed
- **Export** - Export orders to CSV
- **Search & Filter** - Fuzzy search and filter by status

## Architecture

### Monorepo Structure

```
apps/
├── extension/    # React 19 browser extension (Vite + TailwindCSS 4)
└── server/       # Rust API (Axum 0.8 + MongoDB)
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
- JWT validation with JWKS caching

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
| `just build` | Build extension + server |
| `just check` | Run all checks (typecheck + lint + clippy) |
| `just typecheck` | TypeScript type checking |
| `just lint` | Biome lint |
| `just lint-fix` | Biome lint with auto-fix |
| `just format` | Biome format |
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
OIDC_CLIENT_ID=<client-id>
```

## API Documentation

When running the server, Swagger UI is available at `http://localhost:3000/swagger-ui`.

## License

MIT
