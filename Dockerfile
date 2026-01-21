# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps

# Stage 2: Builder
FROM node:20-alpine AS builder
# Install OpenSSL for Prisma
RUN apk add --no-cache openssl
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Ensure public directory exists
RUN mkdir -p ./public

# Generate Prisma Client
RUN npx prisma generate

# Build the application
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Verify build output exists
RUN test -f .next/standalone/server.js || (echo "Build failed: server.js not found" && exit 1)
RUN test -d .next/static || (echo "Build failed: static directory not found" && exit 1)

# Stage 3: Runner
FROM node:20-alpine AS runner
# Install OpenSSL for Prisma runtime
RUN apk add --no-cache openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from builder
# Copy public directory (will be empty if it doesn't exist, which is fine)
COPY --from=builder /app/public ./public

# Copy standalone build - this includes server.js and the .next directory structure
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Copy static files - must be at .next/static relative to server.js location
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy server files (required for RSC - React Server Components)
COPY --from=builder --chown=nextjs:nodejs /app/.next/server ./.next/server

# Copy Prisma files and schema
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Copy package.json for scripts
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
