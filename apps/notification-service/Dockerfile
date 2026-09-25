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

COPY apps/notification-service/package.json ./apps/notification-service/
COPY packages/shared/package.json ./packages/shared/
COPY packages/tsconfig/package.json ./packages/tsconfig/

RUN pnpm install --frozen-lockfile --filter @stockrush/notification-service...


# =========================
# Builder
# =========================
FROM deps AS builder

COPY packages/tsconfig ./packages/tsconfig
COPY packages/shared ./packages/shared
COPY apps/notification-service ./apps/notification-service

# Build shared package first
RUN pnpm --filter @stockrush/shared build

# Build notification service
RUN pnpm --filter @stockrush/notification-service build


# =========================
# Production runner
# =========================
FROM node:20-alpine AS runner

ENV NODE_ENV=production
ENV COREPACK_ENABLE_STRICT=0

WORKDIR /app


# Root node_modules / pnpm virtual store
COPY --from=builder /app/node_modules ./node_modules

# Notification service dependencies
COPY --from=builder /app/apps/notification-service/node_modules ./apps/notification-service/node_modules

# Shared package dependencies
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules

# Shared package metadata
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json

# Shared compiled code
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

# Notification service compiled code
COPY --from=builder /app/apps/notification-service/dist ./apps/notification-service/dist

# Notification service package metadata
COPY apps/notification-service/package.json ./apps/notification-service/package.json


# =========================
# Workspace package resolution
# =========================
RUN mkdir -p /app/node_modules/@stockrush && \
    ln -sf /app/packages/shared /app/node_modules/@stockrush/shared


# =========================
# Runtime
# =========================
WORKDIR /app/apps/notification-service

CMD ["node", "dist/index.js"]