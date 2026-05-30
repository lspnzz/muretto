# Portable multi-stage build for the realtime service.
# rustls (not OpenSSL) means a fully static musl binary with no system TLS deps,
# so the runtime image is tiny and the image runs unchanged on any container host.

FROM rust:1-alpine AS builder
RUN apk add --no-cache musl-dev
WORKDIR /app
COPY . .
RUN cargo build --release --bin realtime

FROM alpine:3 AS runtime
RUN adduser -D -u 10001 app
COPY --from=builder /app/target/release/realtime /usr/local/bin/realtime
USER app
ENV ADDRESS=0.0.0.0:80 RUST_LOG=realtime=info
EXPOSE 80
ENTRYPOINT ["realtime"]
