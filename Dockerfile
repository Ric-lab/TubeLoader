FROM node:20-bookworm-slim AS pruner
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune --scope=tube-loader --docker

FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Install dependencies (only those needed for the specific app)
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json ./package-lock.json
RUN npm ci

# Build the project
COPY --from=pruner /app/out/full/ .
COPY turbo.json turbo.json

# Build with turbo (this runs next build)
RUN npx turbo run build --filter=tube-loader...

FROM node:20-bookworm-slim AS runner
WORKDIR /app

# Install Runtime System Dependencies (Python, FFmpeg)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Add non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

# Set environment
ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# Copy Python requirements
COPY --from=builder /app/apps/tube-loader/requirements.txt ./requirements.txt
# Install Python deps (user level)
RUN pip3 install --no-cache-dir -r requirements.txt --break-system-packages

# Copy Next.js standalone build
# The standalone folder contains a minimal monorepo structure
COPY --from=builder --chown=nextjs:nodejs /app/apps/tube-loader/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/tube-loader/.next/static ./apps/tube-loader/.next/static


# Copy custom scripts
COPY --from=builder --chown=nextjs:nodejs /app/apps/tube-loader/scripts ./apps/tube-loader/scripts

EXPOSE 3000

# Start the server (path depends on monorepo structure in standalone)
CMD ["node", "apps/tube-loader/server.js"]
