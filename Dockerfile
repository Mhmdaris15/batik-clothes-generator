# ── Stage 1: Install dependencies ─────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

COPY batik-generator/package.json batik-generator/package-lock.json ./
RUN npm ci --ignore-scripts

# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY batik-generator/ ./

# clothes_data.json lives one level up at runtime — copy it into the image
COPY clothes_data.json /data/clothes_data.json

# Build-time env defaults (overridden at runtime via Cloud Run env vars)
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ── Stage 3: Production runner ────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"
ENV DATA_DIR="/data"

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy clothes_data.json to where server-env.ts expects it (one level up)
COPY --from=builder /data/clothes_data.json /data/clothes_data.json

# Create writable directory for generated images
RUN mkdir -p /data/generated-images && chown -R nextjs:nodejs /data

USER nextjs

EXPOSE 8080

CMD ["node", "server.js"]
