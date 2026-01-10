# List available commands
default:
    @just --list

alias ci := check

# Run all dev servers (MongoDB + extension + server)
dev: db
    #!/usr/bin/env bash
    trap 'kill 0' EXIT SIGINT SIGTERM
    (cd apps/extension && bun run dev) &
    (cd apps/server && cargo watch -x run) &
    wait

# Stop all dev processes
stop:
    -pkill -f "target/debug/server"
    -pkill -f "vite"
    -lsof -ti:3000 | xargs -r kill -9
    -lsof -ti:5173 | xargs -r kill -9

# Build everything
build:
    cd apps/extension && bun run build
    cd apps/server && cargo build --release

# Run all checks (typecheck + lint + clippy)
check:
    cd apps/extension && bun run typecheck
    cd apps/extension && bun run lint
    cd apps/server && cargo clippy

# TypeScript type check
typecheck:
    cd apps/extension && bun run typecheck

# Lint extension code
lint:
    cd apps/extension && bun run lint

# Lint and auto-fix
lint-fix:
    cd apps/extension && bun run lint:fix

# Format code
format:
    cd apps/extension && bun run format

# Start MongoDB
db:
    docker-compose up -d mongodb

# Stop MongoDB
db-stop:
    docker-compose down

# Clean all build artifacts
clean:
    cd apps/extension && bun run clean
    cd apps/server && cargo clean

# Install dependencies
install:
    cd apps/extension && bun install

# Setup git hooks
setup:
    git config core.hooksPath .githooks
    @echo "Git hooks configured"
