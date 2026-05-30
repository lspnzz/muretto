# Replay simulator image — serves a recorded session for offline development.
FROM rust:1-alpine AS builder
RUN apk add --no-cache musl-dev
WORKDIR /app
COPY . .
RUN cargo build --release --bin simulator

FROM alpine:3 AS runtime
COPY --from=builder /app/target/release/simulator /usr/local/bin/simulator
ENV RUST_LOG=simulator=info
EXPOSE 8000
ENTRYPOINT ["simulator"]
