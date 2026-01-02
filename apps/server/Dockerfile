# syntax=docker/dockerfile:1.6

ARG RUST_VERSION=1.83
ARG DEBIAN_VERSION=bookworm-slim

FROM rust:${RUST_VERSION}-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && \
    apt-get install --no-install-recommends -y pkg-config clang && \
    rm -rf /var/lib/apt/lists/*

# Cache dependencies
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs && cargo build --release && rm -rf src

# Build application
COPY src src
RUN cargo build --release

FROM debian:${DEBIAN_VERSION}

WORKDIR /app

RUN apt-get update && \
    apt-get install --no-install-recommends -y ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/order-wizard-server /usr/local/bin/order-wizard-server
COPY .env.production .env

ENV RUST_LOG=info \
    PORT=8080 \
    HOST=0.0.0.0

EXPOSE 8080

CMD ["/usr/local/bin/order-wizard-server"]
