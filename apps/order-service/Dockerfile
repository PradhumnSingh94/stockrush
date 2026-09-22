FROM node:20-alpine AS base
RUN npm install -g pnpm
ENV COREPACK_ENABLE_STRICT=0
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY turbo.json ./
COPY .npmrc ./  
COPY pnpm-lock.yaml ./  
COPY apps/order-service/package.json ./apps/order-service/
COPY packages/shared/package.json ./packages/shared/
COPY packages/tsconfig/package.json ./packages/tsconfig/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY packages/tsconfig ./packages/tsconfig
COPY packages/shared ./packages/shared
COPY apps/order-service ./apps/order-service
RUN pnpm --filter @stockrush/shared build
RUN pnpm --filter @stockrush/order-service db:generate
RUN pnpm --filter @stockrush/order-service build

FROM node:20-alpine AS runner
RUN npm install -g pnpm
ENV COREPACK_ENABLE_STRICT=0
WORKDIR /app

COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./  
COPY .npmrc ./  
COPY apps/order-service/package.json ./apps/order-service/
COPY packages/shared/package.json ./packages/shared/
COPY packages/tsconfig/package.json ./packages/tsconfig/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/src/proto ./packages/shared/src/proto
COPY --from=builder /app/apps/order-service/dist ./apps/order-service/dist
COPY --from=builder /app/apps/order-service/src/generated ./apps/order-service/generated
COPY apps/order-service/prisma ./apps/order-service/prisma
COPY apps/order-service/prisma.config.ts ./apps/order-service/prisma.config.ts

WORKDIR /app/apps/order-service
EXPOSE 3002
ARG CACHE_BUST=1
COPY apps/order-service/entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

CMD ["./entrypoint.sh"]