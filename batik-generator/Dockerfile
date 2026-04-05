# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the Next.js app
RUN npm run build

# Production stage — node:20-slim (Debian) so we can install Python for ORMBG
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV DATA_DIR=/app/data

# Install Python3 + pip + ORMBG inference dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-pip ca-certificates curl && \
    pip3 install --no-cache-dir --break-system-packages \
        onnxruntime \
        Pillow \
        numpy && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Download ORMBG ONNX model (~168MB)
RUN mkdir -p /app/models && \
    curl -L -o /app/models/ormbg.onnx \
        "https://huggingface.co/schirrmacher/ormbg/resolve/main/ormbg.onnx"

ENV ORMBG_MODEL_PATH=/app/models/ormbg.onnx
ENV ORMBG_PYTHON=python3

# Create non-root user
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nodejs && \
    chown -R nodejs:nodejs /app/models

# Copy built artifacts from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/data ./data
COPY --from=builder /app/scripts/ormbg_inference.py ./scripts/ormbg_inference.py
COPY --from=builder /app/lib/rembg-worker.mjs ./lib/rembg-worker.mjs
COPY --from=builder --chown=nodejs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nodejs:nodejs /app/.next/static ./.next/static

USER nodejs

EXPOSE 8080

CMD ["node", "server.js"]
