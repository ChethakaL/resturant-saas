# Simple development Dockerfile
FROM node:20-alpine

RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps

# Copy the rest of the app
COPY . .

# Generate Prisma Client
RUN npx prisma generate

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run in development mode
CMD ["npm", "run", "dev"]
