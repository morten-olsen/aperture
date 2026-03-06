# syntax=docker/dockerfile:1
FROM rust:1-alpine AS builder

RUN apk add --no-cache musl-dev pkgconfig openssl-dev openssl-libs-static

WORKDIR /src
COPY . .

RUN --mount=type=cache,target=/src/target \
    --mount=type=cache,target=/root/.cargo/registry \
    cargo build --release --bin aperture-server \
    && cp target/release/aperture-server /usr/local/bin/aperture-server

# -------------------------------------------------------------------
FROM scratch

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /usr/local/bin/aperture-server /usr/local/bin/aperture-server

USER 1000
EXPOSE 3000

ENTRYPOINT ["aperture-server"]
