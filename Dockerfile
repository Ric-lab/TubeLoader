# Base image with Node.js 20 (Debian Bookworm - allows easy install of python/ffmpeg)
FROM node:20-bookworm-slim AS base

# Install System Dependencies (Python, FFmpeg)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# --- Dependency Installation Stage ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# Copy Python requirements
COPY requirements.txt ./
# Install Python packages globally in the container (safe since it's a container)
# We use --break-system-packages because we are in a controllable container environment
RUN pip3 install --no-cache-dir -r requirements.txt --break-system-packages

# --- Build Stage ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
# We need python deps in builder too if build scripts use them, but usually not.
# However, we need them in the final runner.
# Let's copy the app source
COPY . .

# Build Next.js
# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# --- Production Runner Stage ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Create a non-root user (best practice)
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy Python dependencies from a step causing issue? 
# Actually, 'deps' stage installed them, but they are in system paths.
# We need to re-install them in runner or copy them.
# The easiest way in Docker for system-packages is to just install them in the final stage or base.
# Let's install them in the final stage to be sure.
COPY requirements.txt ./
RUN pip3 install --no-cache-dir -r requirements.txt --break-system-packages

# Copy Next.js build output
COPY --from=builder /app/public ./public
# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Copy our custom scripts (transcriby.py)
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# Using standalone output
CMD ["node", "server.js"]
