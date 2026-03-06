FROM rust:1-alpine AS builder

RUN apk add --no-cache musl-dev pkgconfig openssl-dev openssl-libs-static

WORKDIR /src

# Cache dependencies by building a dummy project first
COPY Cargo.toml Cargo.lock ./
COPY crates/calendar/Cargo.toml crates/calendar/Cargo.toml
COPY crates/cli/Cargo.toml crates/cli/Cargo.toml
COPY crates/client/Cargo.toml crates/client/Cargo.toml
COPY crates/engine/Cargo.toml crates/engine/Cargo.toml
COPY crates/protocol/Cargo.toml crates/protocol/Cargo.toml
COPY crates/runtime/Cargo.toml crates/runtime/Cargo.toml
COPY crates/sandbox-code/Cargo.toml crates/sandbox-code/Cargo.toml
COPY crates/sandbox-os/Cargo.toml crates/sandbox-os/Cargo.toml
COPY crates/server/Cargo.toml crates/server/Cargo.toml

RUN for dir in crates/*/; do \
  mkdir -p "${dir}src"; \
  echo "" > "${dir}src/lib.rs"; \
  done \
  && echo "fn main() {}" > crates/server/src/main.rs \
  && echo "fn main() {}" > crates/cli/src/main.rs \
  && cargo build --release --bin aperture-server 2>/dev/null || true

# Copy real source and build
COPY crates/ crates/
RUN cargo build --release --bin aperture-server

# -------------------------------------------------------------------
FROM scratch

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /src/target/release/aperture-server /usr/local/bin/aperture-server

USER 1000
EXPOSE 3000

ENTRYPOINT ["aperture-server"]
