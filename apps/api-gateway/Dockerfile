# Stage 1 — base
FROM node:20-alpine AS base

RUN npm install -g pnpm

ENV COREPACK_ENABLE_STRICT=0

WORKDIR /app


# Stage 2 — dependencies
FROM base AS deps

COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY turbo.json ./
COPY pnpm-lock.yaml ./
COPY .npmrc ./

COPY apps/api-gateway/package.json ./apps/api-gateway/
COPY packages/shared/package.json ./packages/shared/
COPY packages/tsconfig/package.json ./packages/tsconfig/

RUN pnpm install --frozen-lockfile --filter @stockrush/api-gateway...


# Stage 3 — builder
FROM deps AS builder

COPY packages/tsconfig ./packages/tsconfig
COPY packages/shared ./packages/shared
COPY apps/api-gateway ./apps/api-gateway

RUN pnpm --filter @stockrush/shared build
RUN pnpm --filter @stockrush/api-gateway build


# Stage 4 — runner
FROM node:20-alpine AS runner

ENV NODE_ENV=production
ENV COREPACK_ENABLE_STRICT=0

WORKDIR /app

# Root pnpm node_modules / virtual store
COPY --from=builder /app/node_modules ./node_modules

# API Gateway dependencies and build
COPY --from=builder /app/apps/api-gateway/node_modules ./apps/api-gateway/node_modules
COPY --from=builder /app/apps/api-gateway/dist ./apps/api-gateway/dist
COPY apps/api-gateway/package.json ./apps/api-gateway/package.json

# Shared package dependencies + package metadata + build
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

# Make @stockrush/shared resolvable
RUN mkdir -p /app/node_modules/@stockrush && \
    ln -sf /app/packages/shared /app/node_modules/@stockrush/shared

WORKDIR /app/apps/api-gateway

EXPOSE 3000

CMD ["node", "dist/index.js"]