# FelFelChat production image (Rust API + Next.js UI).
# Pair with docker-compose.yml for MongoDB.

FROM node:20-bookworm-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=1536
RUN npx next build

FROM rust:1-bookworm AS rust
WORKDIR /src
COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates openssl curl mongodb-database-tools \
 && rm -rf /var/lib/apt/lists/* \
 || (apt-get update \
     && apt-get install -y --no-install-recommends ca-certificates openssl curl \
     && rm -rf /var/lib/apt/lists/*)

COPY --from=web /app /app
COPY --from=rust /src/target/release/felfel-server /usr/local/bin/felfel-server
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
 && mkdir -p /data/uploads /data/backups /data/logs

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    UPLOAD_DIR=/data/uploads \
    BACKUP_DIR=/data/backups \
    AUDIT_LOG_DIR=/data/logs \
    SERVE_FRONTEND=true \
    NEXT_INTERNAL_HOST=127.0.0.1 \
    NEXT_INTERNAL_PORT=3001 \
    NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000
VOLUME ["/data"]
ENTRYPOINT ["/entrypoint.sh"]
