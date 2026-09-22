FROM node:20-alpine AS base
RUN npm install -g pnpm
ENV COREPACK_ENABLE_STRICT=0
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY turbo.json ./
COPY .npmrc ./  
COPY apps/flashsale/package.json ./apps/flashsale/
COPY packages/shared/package.json ./packages/shared/
COPY packages/tsconfig/package.json ./packages/tsconfig/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY packages/tsconfig ./packages/tsconfig
COPY packages/shared ./packages/shared
COPY apps/flashsale ./apps/flashsale
RUN pnpm --filter @stockrush/shared build
RUN pnpm --filter @stockrush/flashsale build

FROM node:20-alpine AS runner
ENV NODE_ENV=production
ENV COREPACK_ENABLE_STRICT=0
WORKDIR /app

COPY .npmrc ./  

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/flashsale/.next/standalone ./
COPY --from=builder /app/apps/flashsale/.next/static ./apps/flashsale/.next/static
COPY --from=builder /app/apps/flashsale/public ./apps/flashsale/public

USER nextjs
EXPOSE 3030

ENV PORT=3030
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/flashsale/server.js"]