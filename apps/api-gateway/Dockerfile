# Stage 1 — base
FROM node:20-alpine AS base
RUN npm install -g pnpm
ENV COREPACK_ENABLE_STRICT=0
WORKDIR /app

# Stage 2 — dependencies
FROM base AS deps
# Copy workspace config first
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY turbo.json ./
COPY pnpm-lock.yaml ./  
COPY .npmrc ./  
# Copy all package.json files — needed for workspace linking
COPY apps/api-gateway/package.json ./apps/api-gateway/
COPY packages/shared/package.json ./packages/shared/
COPY packages/tsconfig/package.json ./packages/tsconfig/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Stage 3 — builder
FROM deps AS builder
# Copy source
COPY packages/tsconfig ./packages/tsconfig
COPY packages/shared ./packages/shared
COPY apps/api-gateway ./apps/api-gateway

# Build shared first then gateway
RUN pnpm --filter @stockrush/shared build
RUN pnpm --filter @stockrush/api-gateway build

# Stage 4 — runner
FROM node:20-alpine AS runner
RUN npm install -g pnpm
ENV COREPACK_ENABLE_STRICT=0
WORKDIR /app

COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./  
COPY .npmrc ./  

COPY apps/api-gateway/package.json ./apps/api-gateway/
COPY packages/shared/package.json ./packages/shared/
COPY packages/tsconfig/package.json ./packages/tsconfig/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/api-gateway/dist ./apps/api-gateway/dist

WORKDIR /app/apps/api-gateway
EXPOSE 3000
CMD ["node", "dist/index.js"]