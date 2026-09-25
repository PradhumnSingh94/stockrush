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
COPY apps/auth-service/package.json ./apps/auth-service/
COPY packages/shared/package.json ./packages/shared/
COPY packages/tsconfig/package.json ./packages/tsconfig/
RUN pnpm install --frozen-lockfile --filter @stockrush/auth-service...

FROM deps AS builder
COPY packages/tsconfig ./packages/tsconfig
COPY packages/shared ./packages/shared
COPY apps/auth-service ./apps/auth-service
RUN pnpm --filter @stockrush/shared build
RUN cd apps/auth-service && npx prisma generate --schema=prisma/schema.prisma
RUN ls apps/auth-service/src/generated/prisma/client
RUN pnpm --filter @stockrush/auth-service build

FROM node:20-alpine AS runner
ENV NODE_ENV=production
ENV COREPACK_ENABLE_STRICT=0
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/auth-service/node_modules ./apps/auth-service/node_modules
COPY --from=builder /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/auth-service/dist ./apps/auth-service/dist
COPY --from=builder /app/apps/auth-service/src/generated ./apps/auth-service/dist/generated
COPY apps/auth-service/prisma ./apps/auth-service/prisma
COPY apps/auth-service/prisma.config.ts ./apps/auth-service/prisma.config.ts
COPY apps/auth-service/package.json ./apps/auth-service/package.json

RUN mkdir -p /app/node_modules/@stockrush && \
    ln -s /app/packages/shared /app/node_modules/@stockrush/shared

WORKDIR /app/apps/auth-service

RUN echo '#!/bin/sh' > entrypoint.sh && \
    echo 'set -e' >> entrypoint.sh && \
    echo 'echo "Running auth-service migrations..."' >> entrypoint.sh && \
    echo './node_modules/.bin/prisma migrate deploy' >> entrypoint.sh && \
    echo 'exec node dist/index.js' >> entrypoint.sh && \
    chmod +x entrypoint.sh

EXPOSE 3003
CMD ["./entrypoint.sh"]