---
name: ordercue
description: Inspect and update a user's OrderCue orders through the installed agent-safe CLI. Use for listing, searching, reading, changing order status, or replacing an order note; not for creating or deleting orders.
---

# OrderCue

Use the installed `ordercue` CLI. It is the supported agent boundary and emits JSON on stdout. Do not call MongoDB or the HTTP API directly.

Before the first operation, run `ordercue --version`. If the binary is unavailable, tell the user that OrderCue CLI must be installed. If it returns `AUTH_REQUIRED`, ask the user to authenticate or configure their local installation; never ask them to paste an access token into chat.

## Commands

```text
ordercue orders list [--status <status>] [--limit <1-100>]
ordercue orders search <query> [--status <status>] [--limit <1-100>]
ordercue orders get <order-id>
ordercue orders status <order-id> <status>
ordercue orders note <order-id> <note>
```

Valid statuses are `uncommented`, `commented`, `comment-revealed`, and `reimbursed`.

Use list/search/get freely when they answer the user's request. Run status or note only when the user's request authorizes that mutation. If a search matches multiple plausible orders, show the candidates or retrieve details before changing one.

Treat a zero exit code as success and parse stdout as JSON. On a nonzero exit, parse stderr as JSON and report its `error.code` and useful message. Do not interpret human-readable fragments from stderr.

Creation, deletion, batch mutation, and arbitrary field updates are intentionally unavailable. Do not work around that boundary with another client or direct API calls.
