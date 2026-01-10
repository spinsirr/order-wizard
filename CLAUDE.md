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
just typecheck    # TypeScript check
just lint         # Biome lint
just lint-fix     # Biome lint with auto-fix
just format       # Biome format

# Database
just db           # Start MongoDB via docker-compose
just db-stop      # Stop MongoDB

# Other
just install      # Install dependencies
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
├── lib/           # Utilities (cn.ts, errors.ts)
├── config/        # OAuth config, repository instances
├── repositories/  # ApiRepository, LocalStorageRepository
├── hooks/         # useOrders (CRUD), useCloudSync (sync)
├── contexts/      # AuthContext
├── components/    # React components
├── constants/     # Shared constants
├── types/         # TypeScript types
└── content/       # Content scripts for Amazon pages
```

### Data Sync (apps/extension/src/hooks/useCloudSync.ts)
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
- Rust uses `?` operator with `AppError` type, panics for unrecoverable states

**Local-First** - localStorage is the source of truth:
- All reads/writes go to localStorage immediately
- Cloud sync happens on login + manual trigger
- Works offline, syncs when connected

**Keep It Simple**:
- Prefer local state (`useState`) over global state when possible
- No state management libraries unless truly needed
- Small, focused components over large "god" components

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

// useCloudSync.ts - Cloud sync logic
export function useCloudSync() { ... }
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
| repositories/ApiRepository.ts | HTTP client for cloud sync (batch operations) |
| repositories/LocalStorageRepository.ts | Chrome storage wrapper |
| hooks/useOrders.ts | Local order CRUD hooks |
| hooks/useCloudSync.ts | Bidirectional sync with conflict resolution |
| contexts/AuthContext.tsx | OAuth state, token management |
| content/content.ts | Injects save buttons on Amazon pages |

### Server
| File | Purpose |
|------|---------|
| main.rs | Server setup, routes, CORS |
| errors.rs | AppError type with IntoResponse impl |
| auth/mod.rs | JWT validation middleware, JWKS fetching |
| routes/orders.rs | Order CRUD handlers |
| models.rs | Order struct, OrderStatus enum |
| db.rs | MongoDB connection, index creation |

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /health | No | Health check |
| GET | /me | Yes | Current user info from JWT |
| GET | /orders | Yes | List user's orders |
| POST | /orders | Yes | Upsert order (by order_number) |
| GET | /orders/:id | Yes | Get single order |
| PATCH | /orders/:id | Yes | Update order |
| DELETE | /orders/:id | Yes | Delete order |
| GET | /swagger-ui | No | API documentation |

## Database

### MongoDB Indices
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
