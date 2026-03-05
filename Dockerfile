FROM rust:1-alpine AS builder

RUN apk add --no-cache musl-dev

WORKDIR /src

# Cache dependencies by building a dummy project first
COPY Cargo.toml Cargo.lock ./
COPY --parents crates/*/Cargo.toml ./

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
