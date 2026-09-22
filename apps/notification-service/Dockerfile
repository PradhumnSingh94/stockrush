FROM node:20-alpine AS base
RUN npm install -g pnpm
ENV COREPACK_ENABLE_STRICT=0
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY .npmrc ./  
COPY turbo.json ./
COPY apps/notification-service/package.json ./apps/notification-service/
COPY packages/shared/package.json ./packages/shared/
COPY packages/tsconfig/package.json ./packages/tsconfig/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY packages/tsconfig ./packages/tsconfig
COPY packages/shared ./packages/shared
COPY apps/notification-service ./apps/notification-service
RUN pnpm --filter @stockrush/shared build
RUN pnpm --filter @stockrush/notification-service build

FROM node:20-alpine AS runner
RUN npm install -g pnpm
ENV COREPACK_ENABLE_STRICT=0
WORKDIR /app

COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY .npmrc ./  
COPY apps/notification-service/package.json ./apps/notification-service/
COPY packages/shared/package.json ./packages/shared/
COPY packages/tsconfig/package.json ./packages/tsconfig/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/notification-service/dist ./apps/notification-service/dist

WORKDIR /app/apps/notification-service
CMD ["node", "dist/index.js"]