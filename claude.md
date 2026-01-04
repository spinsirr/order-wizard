# Amazon Order Wizard

A browser extension for tracking Amazon orders with cloud sync support.

## Project Structure

```
apps/
├── extension/          # Browser extension (React + Vite)
│   └── src/
│       ├── components/     # React components (OrderTable, UserBar, ErrorBoundary)
│       ├── hooks/          # Custom React hooks (useOrders, useOrderSync, useAccessToken)
│       ├── background/     # Service worker for extension messaging
│       ├── content/        # Content scripts for Amazon page scraping
│       ├── store/          # Zustand store for UI state (filters, search, sort)
│       ├── config.ts       # OAuth config, repository classes
│       └── types.ts        # TypeScript types (Order, OrderStatus)
└── server/             # Backend API (Rust + Axum)
    └── src/
        ├── auth/           # JWT validation with JWKS
        ├── routes/         # API route handlers
        ├── db.rs           # MongoDB connection
        ├── models.rs       # Data models (Order, OrderStatus)
        └── main.rs         # Server entry point
```

## Tech Stack

### Extension
- **Framework**: React 18 + TypeScript
- **Build**: Vite
- **State**: TanStack Query (React Query) + Zustand
- **Auth**: react-oidc-context with AWS Cognito
- **Storage**: Chrome Storage API (local) + Cloud API
- **Search**: Fuse.js for fuzzy search
- **Export**: PapaParse for CSV export

### Server
- **Language**: Rust
- **Framework**: Axum 0.8
- **Database**: MongoDB
- **Auth**: JWT validation via Cognito JWKS
- **Docs**: utoipa (OpenAPI/Swagger)

## Design Philosophy

### Fail Fast
- **Do not catch errors** - Let errors propagate and fail visibly
- No try-catch blocks for error suppression
- React Query handles error states for async operations
- ErrorBoundary catches React render errors at the top level
- Rust uses `?` operator to propagate errors, panics for unrecoverable states

## Key Concepts

### Authentication Flow
1. User signs in via Cognito (OIDC authorization code flow)
2. Extension receives JWT access token via react-oidc-context
3. Token is set on ApiRepository via `useAccessToken` hook
4. API requests include `Authorization: Bearer <token>` header
5. Server validates token against Cognito JWKS (cached 1 hour)

### Repository Pattern
Two repository implementations in [config.ts](apps/extension/src/config.ts):
- **LocalStorageRepository**: Uses `chrome.storage.local`, works offline
- **ApiRepository**: HTTP client for cloud API, requires auth token

The `useRepository()` hook in [useOrders.ts](apps/extension/src/hooks/useOrders.ts) returns:
- `apiRepository` when authenticated
- `localRepository` when not authenticated

### Data Sync Strategy
Implemented in [useOrderSync.ts](apps/extension/src/hooks/useOrderSync.ts):

- **Offline-first**: Orders always stored locally, synced to cloud when authenticated
- **Conflict resolution**: `updatedAt` timestamp comparison (last write wins)
- **Soft delete**: Local orders marked with `deletedAt` for sync tracking
- **Re-add detection**: If cloud `updatedAt` > local `deletedAt`, order is restored
- **UserId assignment**: Local orders get user's `sub` claim during sync upload

### Order Lifecycle
1. User visits Amazon order history page
2. Content script ([content.ts](apps/extension/src/content/content.ts)) injects "Save Order" buttons
3. Scraper ([scraper.ts](apps/extension/src/content/scraper.ts)) extracts order data from DOM
4. Order saved to local repository with generated UUID
5. On login: orders synced to cloud with correct userId
6. Changes sync bidirectionally based on timestamps

### Order Status Flow
```
Uncommented → Commented → CommentRevealed → Reimbursed
```

## Commands

```bash
# Extension
cd apps/extension
bun install
bun run dev          # Development server
bun run build        # Production build
bun run typecheck    # TypeScript check
bun run lint         # ESLint

# Server
cd apps/server
cargo build
cargo run            # Start server (port 3000)
cargo clippy         # Lint
```

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

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Health check |
| GET | `/me` | Yes | Current user info from JWT |
| GET | `/orders` | Yes | List user's orders |
| POST | `/orders` | Yes | Create/upsert order |
| PATCH | `/orders/:id` | Yes | Update order (status, note) |
| DELETE | `/orders/:id` | Yes | Delete order |
| GET | `/swagger-ui` | No | API documentation |

## Important Files

### Extension
| File | Purpose |
|------|---------|
| [config.ts](apps/extension/src/config.ts) | OAuth config, LocalStorageRepository, ApiRepository |
| [useOrderSync.ts](apps/extension/src/hooks/useOrderSync.ts) | Bidirectional sync with conflict resolution |
| [useOrders.ts](apps/extension/src/hooks/useOrders.ts) | Order CRUD hooks (useOrders, useDeleteOrders, useSaveOrder) |
| [useAccessToken.ts](apps/extension/src/hooks/useAccessToken.ts) | Sets JWT token on ApiRepository |
| [content.ts](apps/extension/src/content/content.ts) | Injects save buttons on Amazon pages |
| [scraper.ts](apps/extension/src/content/scraper.ts) | Extracts order data from Amazon DOM |
| [orderStore.ts](apps/extension/src/store/orderStore.ts) | UI state (search, filters, sort) + CSV export |
| [types.ts](apps/extension/src/types.ts) | Order interface, OrderStatus enum |

### Server
| File | Purpose |
|------|---------|
| [main.rs](apps/server/src/main.rs) | Server setup, routes, CORS |
| [auth/mod.rs](apps/server/src/auth/mod.rs) | JWT validation middleware, JWKS fetching |
| [routes/orders.rs](apps/server/src/routes/orders.rs) | Order CRUD handlers |
| [models.rs](apps/server/src/models.rs) | Order struct, request/response types |
| [db.rs](apps/server/src/db.rs) | MongoDB connection singleton |

## Data Models

### Order (TypeScript)
```typescript
interface Order {
  id: string;           // UUID
  userId: string;       // Cognito sub claim
  orderNumber: string;  // Amazon order number (unique per user)
  productName: string;
  orderDate: string;    // As displayed on Amazon
  productImage: string; // URL
  price: string;        // Formatted price
  status: OrderStatus;
  note?: string;
  updatedAt?: string;   // ISO timestamp for sync
  createdAt?: string;
  deletedAt?: string;   // Soft delete timestamp
}
```

### OrderStatus
- `uncommented` - Initial state
- `commented` - User left a review
- `comment_revealed` - Review is visible
- `reimbursed` - Got refund/reimbursement
