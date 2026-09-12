---
name: order-wizard
description: Inspect and update a user's Order Wizard orders through the installed agent-safe CLI. Use for listing, searching, reading, changing order status, or replacing an order note; not for creating or deleting orders.
---

# Order Wizard

Use the installed `order-wizard` CLI. It is the supported agent boundary and emits JSON on stdout. Do not call MongoDB or the HTTP API directly.

Before the first operation, run `order-wizard --version`. If the binary is unavailable, tell the user that Order Wizard CLI must be installed. If it returns `AUTH_REQUIRED`, guide the user through `order-wizard auth login`; never ask them to paste an access token into chat.

For Claude Code MCP, use `order-wizard auth login --mcp`, then register `order-wizard mcp` as a stdio server. The MCP profile is separate from the CLI profile; use `auth status --mcp` or `auth logout --mcp` to manage it. Credentials stay in the system credential store. The browser must run on the same computer as the login command.

## Commands

```text
order-wizard orders list [--status <status>] [--limit <1-100>]
order-wizard orders search <query> [--status <status>] [--limit <1-100>]
order-wizard orders get <order-id>
order-wizard orders status <order-id> <status>
order-wizard orders note <order-id> <note>
```

Valid statuses are `uncommented`, `commented`, `comment-revealed`, and `reimbursed`.

Use list/search/get freely when they answer the user's request. Run status or note only when the user's request authorizes that mutation. If a search matches multiple plausible orders, show the candidates or retrieve details before changing one.

Treat a zero exit code as success and parse stdout as JSON. On a nonzero exit, parse stderr as JSON and report its `error.code` and useful message. Do not interpret human-readable fragments from stderr.

Creation, deletion, batch mutation, and arbitrary field updates are intentionally unavailable. Do not work around that boundary with another client or direct API calls.
