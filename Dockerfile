FROM rust:1-bookworm AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src

# Cache dependencies by building a dummy project first
COPY Cargo.toml Cargo.lock ./
COPY crates/engine/Cargo.toml crates/engine/Cargo.toml
COPY crates/runtime/Cargo.toml crates/runtime/Cargo.toml
COPY crates/server/Cargo.toml crates/server/Cargo.toml
COPY crates/client/Cargo.toml crates/client/Cargo.toml
COPY crates/cli/Cargo.toml crates/cli/Cargo.toml
COPY crates/protocol/Cargo.toml crates/protocol/Cargo.toml
COPY crates/sandbox-code/Cargo.toml crates/sandbox-code/Cargo.toml
COPY crates/sandbox-os/Cargo.toml crates/sandbox-os/Cargo.toml

RUN mkdir -p crates/engine/src crates/runtime/src crates/server/src \
    crates/client/src crates/cli/src crates/protocol/src \
    crates/sandbox-code/src crates/sandbox-os/src \
    && echo "fn main() {}" > crates/server/src/main.rs \
    && echo "fn main() {}" > crates/cli/src/main.rs \
    && for d in engine runtime client protocol sandbox-code sandbox-os; do \
         echo "" > crates/$d/src/lib.rs; \
       done \
    && cargo build --release --bin aperture-server 2>/dev/null || true

# Copy real source and build
COPY crates/ crates/
RUN cargo build --release --bin aperture-server

# -------------------------------------------------------------------
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 1000 aperture \
    && useradd --uid 1000 --gid aperture --create-home aperture

COPY --from=builder /src/target/release/aperture-server /usr/local/bin/aperture-server

USER aperture
EXPOSE 3000

ENTRYPOINT ["aperture-server"]
