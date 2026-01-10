# CI checks (used by pre-commit hook)
ci: typecheck lint check-server

# Start MongoDB
db:
    docker-compose up -d mongodb

# Stop MongoDB
db-stop:
    docker-compose down

# Run all dev servers in parallel (starts MongoDB first)
# Note: Use Ctrl+C twice or run `just stop` to kill all processes
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

# Extension commands
dev-extension:
    cd apps/extension && bun run dev

build-extension:
    cd apps/extension && bun run build

lint-extension:
    cd apps/extension && bun run lint

lint:
    cd apps/extension && bun run lint

lint-fix:
    cd apps/extension && bun run lint:fix

format:
    cd apps/extension && bun run format

typecheck-extension:
    cd apps/extension && bun run typecheck

typecheck:
    cd apps/extension && bun run typecheck

# Server commands
dev-server:
    cd apps/server && cargo watch -x run

build-server:
    cd apps/server && cargo build --release

check-server:
    cd apps/server && cargo clippy

# Run all builds
build: build-extension build-server

# Run all checks
check: typecheck-extension check-server lint-extension

# Clean all
clean:
    cd apps/extension && bun run clean
    cd apps/server && cargo clean

# Install dependencies
install:
    cd apps/extension && bun install
