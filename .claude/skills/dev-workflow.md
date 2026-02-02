---
name: dev-workflow
description: Use when developing, building, testing, or deploying Amazon Order Wizard. Covers extension build, server deploy, and common dev tasks.
---

# Amazon Order Wizard Development Workflow

## Quick Commands (justfile)

```bash
just              # Show all available commands
just dev          # Start MongoDB + extension dev server + Rust server
just stop         # Kill all dev processes
just build        # Build extension + server (copies to /mnt/c/order-wizard-ext)
just check        # Run all checks (typecheck + lint + clippy)
just lint-fix     # Auto-fix lint issues
```

## Build & Deploy

### Extension Build
```bash
just build        # Builds extension and copies to Windows path
```
After build, reload extension in `chrome://extensions`.

### Server Deploy (Fly.io)
```bash
cd apps/server
fly deploy        # Deploy to production
fly logs -a order-wizard-api  # View logs
fly status -a order-wizard-api  # Check status
```

### Environment Variables (Fly.io)
```bash
fly secrets list -a order-wizard-api
fly secrets set KEY=value -a order-wizard-api
```

## Project Structure

- **apps/extension/** - React 19 Chrome extension (Vite + TailwindCSS 4)
- **apps/server/** - Rust API (Axum + MongoDB)

### Key Extension Paths
- `src/content/` - Content scripts (Amazon scraping, FB form filler)
- `src/components/` - React components
- `src/hooks/` - React Query hooks
- `src/contexts/` - Auth & Sync contexts
- `src/types/` - TypeScript types
- `public/manifest.json` - Extension manifest (fixed key for stable ID)

### Key Server Paths
- `src/main.rs` - Routes, CORS, rate limiting
- `src/auth/` - JWT/JWKS validation
- `src/routes/` - API handlers

## Common Tasks

### Add New Content Script Feature
1. Add files to `src/content/`
2. Update `public/manifest.json` content_scripts if new page match needed
3. `just build` to rebuild

### Modify API Endpoint
1. Edit `apps/server/src/routes/`
2. `cargo check` to verify
3. `fly deploy` to deploy

### Debug Production Issues
```bash
fly logs -a order-wizard-api          # Recent logs
curl https://order-wizard-api.fly.dev/health  # Health check
```

## Extension ID
Fixed via manifest key: `kfohphllanmaojigofaoedibjbcdlhmj`

OAuth redirect URI: `https://kfohphllanmaojigofaoedibjbcdlhmj.chromiumapp.org/`
