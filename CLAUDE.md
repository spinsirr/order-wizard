# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Amazon Order Wizard - A browser extension for tracking Amazon orders with cloud sync support.

## Commands

```bash
# Run `just` to see all available commands

# Development
just dev          # Start MongoDB + extension dev server + Rust server
just stop         # Kill all dev processes

# Build
just build        # Build extension + server

# Code Quality
just check        # Run all checks (typecheck + lint + clippy)
just ci           # Alias for check
just typecheck    # TypeScript check
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
```

## Architecture

### Monorepo Structure
- **apps/extension/** - React 19 browser extension (Vite + TailwindCSS 4)
- **apps/server/** - Rust API (Axum 0.8 + MongoDB)
- Package manager: Bun (workspaces in `apps/*`)

### Authentication Flow
1. Cognito OIDC authorization code flow via oauth4webapi
2. Extension receives JWT access token
3. Token set on ApiRepository via AuthContext effect
4. Server validates JWT against Cognito JWKS (cached 1 hour)

### Extension Structure (apps/extension/src/)
```
src/
├── App.tsx              # Main app with ErrorBoundary
├── main.tsx             # Entry point
├── lib/                 # Utilities (cn.ts, errors.ts, syncQueue.ts)
├── utils/               # Order filtering (orderFilters.ts), export (orderExport.ts)
├── config/              # OAuth config, repository instances, env
├── repositories/        # ApiRepository, LocalStorageRepository
├── hooks/               # useOrders (CRUD + save)
├── contexts/            # AuthContext, SyncContext
├── components/          # React components
│   └── ui/              # Reusable UI primitives (button, card, badge)
├── constants/           # Shared constants (ORDERS_KEY, LOCAL_USER_ID)
├── types/               # TypeScript types (Order, User, AuthUser, OrderStatus)
├── schemas/             # Zod validation schemas
├── content/             # Content scripts for Amazon pages
│   ├── content.ts       # Main entry
│   ├── injector.ts      # Inject save buttons
│   ├── scraper.ts       # Scrape order data
│   ├── orderProcessor.ts
│   └── userResolver.ts
└── background/          # Background script
```

### Server Structure (apps/server/src/)
```
src/
├── main.rs              # Server setup, routes, CORS, Swagger UI
├── models.rs            # OrderStatus, Order, request/response types
├── errors.rs            # AppError enum, AppResult type
├── db.rs                # MongoDB connection
├── auth/
│   └── mod.rs           # JWT validation, JWKS caching, AuthUser extractor
└── routes/
    ├── mod.rs           # Route exports
    └── orders.rs        # Order CRUD handlers
```

### Data Sync
- Offline-first: orders stored locally, synced to cloud when authenticated
- Conflict resolution: `updatedAt` timestamp comparison (last write wins)
- Soft delete: local orders marked with `deletedAt` for sync tracking
- Sync queue with exponential backoff retry (max 3 retries)

### Order Status Flow
```
Uncommented -> Commented -> CommentRevealed -> Reimbursed
```

## Design Philosophy

**Fail Fast** - Let errors propagate and fail visibly:
- No try-catch blocks for error suppression
- React Query handles error states for async operations
- ErrorBoundary catches React render errors at top level
- Rust uses `?` operator with `AppError` type, panics for unrecoverable states

**Local-First** - localStorage is the source of truth:
- All reads/writes go to localStorage immediately
- Cloud sync happens on login + manual trigger
- Works offline, syncs when connected

**Keep It Simple**:
- Prefer local state (`useState`) over global state when possible
- No state management libraries unless truly needed
- Small, focused components over large "god" components

## Git Conventions

**Commits** - Do NOT include "Generated with Claude", "Co-Authored-By: Claude", or any AI attribution in commit messages, issues, or PRs.

**Commit Message Format**:
```
type: short description

Optional longer description.
```

Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`

## Code Conventions

### TypeScript/React

**Imports** - Use path aliases:
```typescript
import { useAuth } from '@/contexts/AuthContext';  // Good
import { useAuth } from '../../../contexts/AuthContext';  // Avoid
```

**Components** - Keep focused and small:
```typescript
// Good: Single responsibility
function OrderCard({ order, onStatusChange }: OrderCardProps) { ... }
function OrderTableToolbar({ onSearch, onExport }: ToolbarProps) { ... }

// Avoid: God components with 500+ lines
function OrderTable() { /* everything here */ }
```

**Hooks** - Separate concerns:
```typescript
// useOrders.ts - Local CRUD operations
export function useOrders() { ... }
export function useUpdateOrderStatus() { ... }
export function useDeleteOrders() { ... }
export function useSaveOrder() { ... }
```

**State** - Prefer local over global:
```typescript
// Good: Local state in component
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

// Avoid: Global state for UI-only concerns
const useStore = create((set) => ({ selectedIds: new Set(), ... }));
```

**Styling** - Use cn() for conditional classes:
```typescript
import { cn } from '@/lib/cn';

<div className={cn(
  "base-classes",
  isActive && "active-classes",
  variant === "primary" && "primary-classes"
)} />
```

### React Query Patterns

**Queries** - For reading data:
```typescript
const { data: orders, isLoading, error } = useQuery({
  queryKey: ORDERS_KEY,
  queryFn: async () => localRepository.getAll(),
});
```

**Mutations** - With optimistic updates:
```typescript
const mutation = useMutation({
  mutationFn: async (data) => { ... },
  onMutate: async (data) => {
    await queryClient.cancelQueries({ queryKey: ORDERS_KEY });
    const previous = queryClient.getQueryData(ORDERS_KEY);
    queryClient.setQueryData(ORDERS_KEY, (old) => /* optimistic update */);
    return { previous };
  },
  onError: (err, data, context) => {
    queryClient.setQueryData(ORDERS_KEY, context?.previous);
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ORDERS_KEY });
  },
});
```

### Rust

**Error Handling** - Use `?` operator with custom error types:
```rust
async fn handler() -> AppResult<Json<Data>> {
    let result = some_operation()
        .await
        .map_err(AppError::database)?;
    Ok(Json(result))
}
```

**Avoid** manual match blocks for errors:
```rust
// Avoid
match collection.find(filter).await {
    Ok(cursor) => cursor,
    Err(e) => {
        tracing::error!("Failed: {}", e);
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(Vec::new()));
    }
}
```

## Key Files

### Extension
| File | Purpose |
|------|---------|
| config/index.ts | Repository instances, environment config |
| config/oauth.ts | OAuth configuration for Cognito |
| config/env.ts | Environment variable imports |
| repositories/ApiRepository.ts | HTTP client for cloud sync |
| repositories/LocalStorageRepository.ts | Chrome storage wrapper |
| hooks/useOrders.ts | useOrders, useUpdateOrderStatus, useDeleteOrders, useSaveOrder |
| contexts/AuthContext.tsx | OAuth state, token management, refresh |
| contexts/SyncContext.tsx | Sync state (isSyncing, lastSyncedAt, pendingCount) |
| lib/syncQueue.ts | Sync queue with retry logic (exponential backoff) |
| lib/cn.ts | clsx + tailwind-merge utility |
| lib/errors.ts | Global error handler setup |
| utils/orderFilters.ts | searchOrders, sortOrders, filterOrdersByStatus |
| utils/orderExport.ts | exportOrdersToCSV (papaparse) |
| schemas/order.ts | Zod schemas: OrderSchema, ScrapedOrderDataSchema |
| content/content.ts | Main content script entry |
| content/scraper.ts | Scrape order data from Amazon pages |
| content/injector.ts | Inject save buttons on Amazon |

### Extension Components
| Component | Purpose |
|-----------|---------|
| OrderTable.tsx | Main table with filtering, sorting, selection |
| OrderTableToolbar.tsx | Select all, delete, export controls |
| OrderTableFilters.tsx | Search, status filter, sort dropdown |
| OrderCard.tsx | Individual order with status buttons |
| UserBar.tsx | Auth status, email, sync indicator |
| DeleteConfirmModal.tsx | Single/bulk delete confirmation |
| OrderEmptyStates.tsx | Loading, empty, no results states |
| ErrorBoundary.tsx | React error boundary |
| ui/button.tsx | Button (filled, tonal, outline, text, icon, destructive) |
| ui/card.tsx | Card with elevation levels |
| ui/badge.tsx | Badge (default, success, warning, info, destructive, outline) |

### Server
| File | Purpose |
|------|---------|
| main.rs | Server setup, routes, CORS, Swagger UI |
| errors.rs | AppError type with IntoResponse impl |
| auth/mod.rs | JWT validation middleware, JWKS caching |
| routes/orders.rs | Order CRUD handlers |
| models.rs | Order struct, OrderStatus enum, request/response types |
| db.rs | MongoDB connection |

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /health | No | Health check |
| GET | /me | Yes | Current user info from JWT |
| GET | /orders | Yes | List user's orders |
| POST | /orders | Yes | Upsert order (by order_number) |
| GET | /orders/{id} | Yes | Get single order |
| PATCH | /orders/{id} | Yes | Update order |
| DELETE | /orders/{id} | Yes | Delete order |
| GET | /swagger-ui | No | API documentation |
| GET | /api-docs/openapi.json | No | OpenAPI schema |

## Database

### MongoDB
- Database: `order_wizard`
- Collection: `orders`

### Indices
Created automatically on startup:
- `user_id` - for listing user's orders
- `(user_id, order_number)` - unique, for upsert
- `(id, user_id)` - for single order lookup

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
OIDC_ISSUER=https://cognito-idp.<region>.amazonaws.com/<pool-id>
OIDC_CLIENT_ID=<client-id>
```

## Data Model

```typescript
enum OrderStatus {
  Uncommented = 'uncommented',
  Commented = 'commented',
  CommentRevealed = 'comment_revealed',
  Reimbursed = 'reimbursed'
}

interface Order {
  id: string;           // UUID
  userId: string;       // Cognito sub claim
  orderNumber: string;  // Amazon order number (unique per user)
  productName: string;
  orderDate: string;
  productImage: string;
  price: string;
  status: OrderStatus;
  note?: string;
  updatedAt?: string;   // ISO timestamp for sync
  createdAt?: string;
  deletedAt?: string;   // Soft delete timestamp
}

interface AuthUser {
  sub: string;
  email?: string;
  access_token: string;
  id_token: string;
  refresh_token?: string;
  expires_at: number;
}
```

## Utilities

### Order Filtering (utils/orderFilters.ts)
```typescript
type StatusFilter = OrderStatus | 'all'
type OrderSortOption = 'created-desc' | 'created-asc' | 'date-desc' | 'date-asc'

searchOrders(orders, query)              // match-sorter fuzzy search
sortOrders(orders, option)               // Sort by created or order date
filterOrdersByStatus(orders, status)     // Filter by status
filterAndSortOrders(orders, query, status, sort)  // Combined pipeline
```

### Sync Queue (lib/syncQueue.ts)
```typescript
type SyncOperation = 'create' | 'update' | 'delete'

syncQueue.add(operation)       // Add to queue, deduplicate, process
syncQueue.process()            // Process with retry (max 3, exponential backoff)
syncQueue.getPendingCount()    // Get queue length
syncQueue.subscribe(listener)  // Observer pattern for queue changes
```

## Dependencies

### Extension (Key)
- react ^19.1.1
- @tanstack/react-query ^5.90
- oauth4webapi ^3.8
- zod ^4.1
- papaparse ^5.5
- lucide-react ^0.545
- match-sorter ^8.2
- tailwindcss ^4.1
- clsx + tailwind-merge

### Server
- axum 0.8
- mongodb (async driver)
- jsonwebtoken + jwks_client
- tokio (async runtime)
- utoipa (OpenAPI)
