# syntax=docker/dockerfile:1

# ---- Dependências ----
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Build ----
FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Necessário para o `next build` (output: standalone).
ENV NEXT_TELEMETRY_DISABLED=1
# Variáveis NEXT_PUBLIC_* são embutidas no bundle no momento do build.
# A anon key do Supabase é pública por design, então pode vir como build-arg.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN npm run build

# ---- Runtime ----
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Cloud Run injeta a porta via $PORT (default 8080).
ENV PORT=8080

# Usuário sem privilégios.
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# Artefatos do build standalone.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 8080
# server.js é gerado pelo output standalone e respeita $PORT/$HOSTNAME.
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
