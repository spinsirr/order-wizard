# Order Sync Redesign

## Overview

Simplify the order synchronization logic using a Last Write Wins (LWW) strategy.

## Core Principles

- **Unique Identifier**: `orderNumber` is the unique identifier for orders (cross-device recognition)
- **Conflict Strategy**: Last Write Wins - compare `updatedAt`, keep the newest version
- **Sync Direction**:
  - **Push**: Local changes are pushed to cloud immediately (via syncQueue)
  - **Pull**: Fetch latest from cloud when opening popup
- **Delete Strategy**: Unified soft delete (`deletedAt` field)
  - Remove `deleted_order_numbers` tracking mechanism
  - Soft-deleted orders sync to cloud, then can be physically deleted locally
- **Offline Support**: All operations work locally, sync on login

## Sync Flow

### Push Flow (Local → Cloud)

When user performs an operation:
1. Write to local storage immediately
2. If logged in, add operation to syncQueue
3. syncQueue attempts push immediately
4. On failure, retry with exponential backoff (max 3 retries)

Operation types simplified to:
- `upsert`: Create or update order (POST /orders, server upserts by orderNumber)
- `delete`: Delete order (DELETE /orders/:id)

### Pull Flow (Cloud → Local)

Triggered when: Opening popup

```
1. Fetch all cloud orders
2. Fetch all local orders
3. Match by orderNumber, compare updatedAt
4. Keep newest version, write to local
5. Handle cloud-only orders (download)
6. Handle local-only orders (upload)
```

## Merge Algorithm

```typescript
async function pullAndMerge() {
  const [localOrders, cloudOrders] = await Promise.all([
    localRepository.getAll(),
    apiRepository.getAll(),
  ]);

  const localMap = new Map(localOrders.map(o => [o.orderNumber, o]));
  const cloudMap = new Map(cloudOrders.map(o => [o.orderNumber, o]));
  const allOrderNumbers = new Set([...localMap.keys(), ...cloudMap.keys()]);

  for (const orderNumber of allOrderNumbers) {
    const local = localMap.get(orderNumber);
    const cloud = cloudMap.get(orderNumber);

    if (local && cloud) {
      // Both exist → compare updatedAt, keep newest
      const winner = local.updatedAt > cloud.updatedAt ? local : cloud;
      await localRepository.save(winner);
      if (local.updatedAt > cloud.updatedAt) {
        syncQueue.add({ type: 'upsert', order: local });
      }
    } else if (cloud && !local) {
      // Cloud only → download
      await localRepository.save(cloud);
    } else if (local && !cloud) {
      // Local only → upload
      syncQueue.add({ type: 'upsert', order: local });
    }
  }
}
```

## Delete Handling

### Scenarios

1. **Local delete, logged in**
   - Set `deletedAt = now`, `updatedAt = now`
   - Push upsert to cloud (cloud also marks deleted)
   - UI filters out orders with `deletedAt`

2. **Local delete, not logged in**
   - Same: set `deletedAt` and `updatedAt`
   - On login, merge will push to cloud

3. **Cloud deleted, local not deleted**
   - On pull, compare `updatedAt`
   - If cloud's `deletedAt` version is newer, mark local as deleted

4. **Physical deletion timing**
   - After sync completes, can clean up locally soft-deleted + synced orders
   - Or keep for N days then clean (optional)

## Code Changes

### Remove

From `LocalStorageRepository.ts`:
- `trackDeletedOrderNumber()`
- `getDeletedOrderNumbers()`
- `clearDeletedOrderNumbers()`
- `removeDeletedOrderNumber()`
- `DELETED_ORDERS_KEY` constant

### Modify

1. **SyncContext.tsx**
   - `pullCloudOrders` → `pullAndMerge` (new merge logic)
   - Remove `deleted_order_numbers` handling
   - Trigger sync on popup open (already exists)

2. **useOrders.ts**
   - `useDeleteOrders`: Unified soft delete, no login state branching
   - On delete: set `deletedAt` + `updatedAt`, then upsert

3. **syncQueue.ts**
   - Simplify operation types to `upsert` and `delete`
   - `delete` uses `orderNumber` instead of `id`

4. **ApiRepository.ts**
   - Likely no changes needed (POST /orders already upserts)

## Data Model

```typescript
interface Order {
  id: string;           // UUID
  userId: string;       // Cloud user ID
  orderNumber: string;  // Unique identifier (for merging)
  productName: string;
  orderDate: string;
  productImage: string;
  price: string;
  status: OrderStatus;
  note?: string;
  updatedAt: string;    // Conflict resolution key (required)
  createdAt: string;
  deletedAt?: string;   // Soft delete marker
}

// Simplified sync operations
type SyncOperation =
  | { type: 'upsert'; order: Order }
  | { type: 'delete'; orderNumber: string }
```
