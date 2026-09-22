FROM node:20-alpine AS base
RUN npm install -g pnpm
ENV COREPACK_ENABLE_STRICT=0
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY turbo.json ./
COPY pnpm-lock.yaml ./  
COPY .npmrc ./  
COPY apps/product-service/package.json ./apps/product-service/
COPY packages/shared/package.json ./packages/shared/
COPY packages/tsconfig/package.json ./packages/tsconfig/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY packages/tsconfig ./packages/tsconfig
COPY packages/shared ./packages/shared
COPY apps/product-service ./apps/product-service
RUN pnpm --filter @stockrush/shared build
RUN pnpm --filter @stockrush/product-service db:generate
RUN pnpm --filter @stockrush/product-service build

FROM node:20-alpine AS runner
RUN npm install -g pnpm
ENV COREPACK_ENABLE_STRICT=0
WORKDIR /app

COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./  
COPY .npmrc ./  
COPY apps/product-service/package.json ./apps/product-service/
COPY packages/shared/package.json ./packages/shared/
COPY packages/tsconfig/package.json ./packages/tsconfig/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/src/proto ./packages/shared/src/proto
COPY --from=builder /app/apps/product-service/dist ./apps/product-service/dist
COPY --from=builder /app/apps/product-service/src/generated ./apps/product-service/generated
COPY apps/product-service/prisma ./apps/product-service/prisma
COPY apps/product-service/prisma.config.ts ./apps/product-service/prisma.config.ts

WORKDIR /app/apps/product-service
EXPOSE 3001
EXPOSE 50051
ARG CACHE_BUST=1
COPY apps/product-service/entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

CMD ["./entrypoint.sh"]