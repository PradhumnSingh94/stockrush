FROM node:20-alpine AS base

RUN npm install -g pnpm

ENV COREPACK_ENABLE_STRICT=0

WORKDIR /app


# =========================
# Dependencies
# =========================
FROM base AS deps

COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY turbo.json ./
COPY pnpm-lock.yaml ./
COPY .npmrc ./

COPY apps/order-service/package.json ./apps/order-service/
COPY packages/shared/package.json ./packages/shared/
COPY packages/tsconfig/package.json ./packages/tsconfig/

RUN pnpm install --frozen-lockfile --filter @stockrush/order-service...


# =========================
# Builder
# =========================
FROM deps AS builder

COPY packages/tsconfig ./packages/tsconfig
COPY packages/shared ./packages/shared
COPY apps/order-service ./apps/order-service

# Build shared package first
RUN pnpm --filter @stockrush/shared build

# Generate Prisma client
RUN pnpm --filter @stockrush/order-service db:generate

# Build order service
RUN pnpm --filter @stockrush/order-service build


# =========================
# Production runner
# =========================
FROM node:20-alpine AS runner

ENV NODE_ENV=production
ENV COREPACK_ENABLE_STRICT=0

WORKDIR /app


# Root node_modules / pnpm virtual store
COPY --from=builder /app/node_modules ./node_modules

# Order service dependencies
COPY --from=builder /app/apps/order-service/node_modules ./apps/order-service/node_modules

# Shared package dependencies
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules

# Shared package metadata
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json

# Shared compiled code
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

# Shared proto files
COPY --from=builder /app/packages/shared/src/proto ./packages/shared/src/proto

# Order service compiled code
COPY --from=builder /app/apps/order-service/dist ./apps/order-service/dist

# Order service package metadata
COPY apps/order-service/package.json ./apps/order-service/package.json

# Prisma files required at runtime
COPY apps/order-service/prisma ./apps/order-service/prisma
COPY apps/order-service/prisma.config.ts ./apps/order-service/prisma.config.ts


# =========================
# Workspace package resolution
# =========================
RUN mkdir -p /app/node_modules/@stockrush && \
    ln -sf /app/packages/shared /app/node_modules/@stockrush/shared


# =========================
# Runtime
# =========================
WORKDIR /app/apps/order-service

EXPOSE 3002


# Migration + application startup
RUN echo '#!/bin/sh' > entrypoint.sh && \
    echo 'set -e' >> entrypoint.sh && \
    echo 'echo "Running order-service migrations..."' >> entrypoint.sh && \
    echo './node_modules/.bin/prisma migrate deploy' >> entrypoint.sh && \
    echo 'exec node dist/index.js' >> entrypoint.sh && \
    chmod +x entrypoint.sh

CMD ["./entrypoint.sh"]