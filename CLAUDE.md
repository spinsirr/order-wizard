# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Amazon Order Wizard - A browser extension for tracking Amazon orders with cloud sync support.

## Commands

```bash
# Development
just dev                # Start MongoDB + extension dev server + Rust server
just stop               # Kill all dev processes
just dev-extension      # Extension dev server only
just dev-server         # Rust server only (with cargo watch)

# Database
just db                 # Start MongoDB via docker-compose
just db-stop            # Stop MongoDB

# Build
just build              # Build extension + server
just build-extension    # Extension production build
just build-server       # Server release build

# Code Quality
just check              # Run all checks (typecheck + clippy + lint)
just typecheck          # TypeScript check
just lint               # Biome lint
just lint-fix           # Biome lint with auto-fix
just format             # Biome format
just check-server       # Cargo clippy

# Other
just install            # Install dependencies
just clean              # Clean all build artifacts
```

## Architecture

### Monorepo Structure
- **apps/extension/** - React 19 browser extension (Vite + TailwindCSS 4)
- **apps/server/** - Rust API (Axum 0.8 + MongoDB)
- Package manager: Bun (workspaces in `apps/*`)

### Authentication Flow
1. Cognito OIDC authorization code flow via react-oidc-context
2. Extension receives JWT access token
3. Token set on ApiRepository via `useAccessToken` hook
4. Server validates JWT against Cognito JWKS (cached 1 hour)

### Repository Pattern (apps/extension/src/config.ts)
- **LocalStorageRepository**: `chrome.storage.local`, works offline
- **ApiRepository**: HTTP client for cloud API, requires auth token
- `useRepository()` hook returns apiRepository when authenticated, localRepository otherwise

### Data Sync (apps/extension/src/hooks/useOrderSync.ts)
- Offline-first: orders stored locally, synced to cloud when authenticated
- Conflict resolution: `updatedAt` timestamp comparison (last write wins)
- Soft delete: local orders marked with `deletedAt` for sync tracking

### Order Status Flow
```
Uncommented → Commented → CommentRevealed → Reimbursed
```

## Design Philosophy

**Fail Fast** - Let errors propagate and fail visibly:
- No try-catch blocks for error suppression
- React Query handles error states for async operations
- ErrorBoundary catches React render errors at top level
- Rust uses `?` operator to propagate errors, panics for unrecoverable states

## Key Files

### Extension
| File | Purpose |
|------|---------|
| config.ts | OAuth config, repository implementations |
| hooks/useOrderSync.ts | Bidirectional sync with conflict resolution |
| hooks/useOrders.ts | Order CRUD hooks |
| content/content.ts | Injects save buttons on Amazon pages |
| content/scraper.ts | Extracts order data from Amazon DOM |
| store/orderStore.ts | Zustand store for UI state + CSV export |

### Server
| File | Purpose |
|------|---------|
| main.rs | Server setup, routes, CORS |
| auth/mod.rs | JWT validation middleware, JWKS fetching |
| routes/orders.rs | Order CRUD handlers |
| models.rs | Order struct, request/response types |
| db.rs | MongoDB connection singleton |

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /health | No | Health check |
| GET | /me | Yes | Current user info from JWT |
| GET | /orders | Yes | List user's orders |
| POST | /orders | Yes | Create/upsert order |
| PATCH | /orders/:id | Yes | Update order |
| DELETE | /orders/:id | Yes | Delete order |
| GET | /swagger-ui | No | API documentation |

## Environment Variables

### Extension (.env)
```
VITE_COGNITO_AUTHORITY=https://cognito-idp.<region>.amazonaws.com/<pool-id>
VITE_COGNITO_CLIENT_ID=<client-id>
VITE_COGNITO_DOMAIN=https://<domain>.auth.<region>.amazoncognito.com
VITE_API_BASE_URL=http://localhost:3000
```

### Server (.env)
```
MONGODB_URI=mongodb://localhost:27017
COGNITO_ISSUER=https://cognito-idp.<region>.amazonaws.com/<pool-id>
```

## Data Model

```typescript
interface Order {
  id: string;           // UUID
  userId: string;       // Cognito sub claim
  orderNumber: string;  // Amazon order number (unique per user)
  productName: string;
  orderDate: string;
  productImage: string;
  price: string;
  status: OrderStatus;  // uncommented | commented | comment_revealed | reimbursed
  note?: string;
  updatedAt?: string;   // ISO timestamp for sync
  createdAt?: string;
  deletedAt?: string;   // Soft delete timestamp
}
```
