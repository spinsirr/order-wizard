# Start MongoDB
db:
    docker-compose up -d mongodb

# Stop MongoDB
db-stop:
    docker-compose down

# Run all dev servers in parallel (starts MongoDB first)
dev: db
    just dev-extension &
    just dev-server &
    wait

# Extension commands
dev-extension:
    cd apps/extension && bun run dev

build-extension:
    cd apps/extension && bun run build

lint-extension:
    cd apps/extension && bun run lint

typecheck-extension:
    cd apps/extension && bun run typecheck

# Server commands
dev-server:
    cd apps/server && cargo run

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
