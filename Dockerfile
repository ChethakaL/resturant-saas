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

# Debug: List what's in the standalone folder
RUN ls -la .next/standalone/
RUN ls -la .next/standalone/.next/ || echo "No .next in standalone"
RUN ls -la .next/standalone/.next/server/ || echo "No server folder"

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

# Create the .next directory with correct permissions
RUN mkdir -p .next
RUN chown nextjs:nodejs .next

# Copy public directory
COPY --from=builder /app/public ./public

# Copy the entire standalone directory contents
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Copy static files - MUST be after standalone copy
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma files and schema
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Use node directly instead of npm start
CMD ["node", "server.js"]
