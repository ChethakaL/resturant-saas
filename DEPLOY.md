# Docker Deployment Instructions

## Prerequisites
- Docker and Docker Compose installed on your VPS
- PostgreSQL database (can be external or in a separate container)
- Environment variables configured

## Quick Start

1. **Clone the repository** (if not already done):
```bash
git clone https://github.com/ChethakaL/resturant-saas.git
cd resturant-saas
```

2. **Create `.env` file** with your environment variables:
```bash
cp .env.example .env
# Edit .env with your actual values
```

Required environment variables:
- `DATABASE_URL` - PostgreSQL connection string
- `NEXTAUTH_SECRET` - Secret for NextAuth.js
- `NEXTAUTH_URL` - Your application URL (e.g., `http://localhost:3013`)

3. **Build and run with Docker Compose**:
```bash
docker-compose up -d --build
```

4. **Run Prisma migrations** (if needed):
```bash
docker exec -it resturant-saas npx prisma migrate deploy
```

5. **Seed the database** (optional):
```bash
docker exec -it resturant-saas npm run db:seed
```

## Manual Docker Commands

If you prefer to build and run manually:

```bash
# Build the image
docker build -t resturant-saas:latest .

# Run the container
docker run -d \
  --name resturant-saas \
  --restart unless-stopped \
  -p 127.0.0.1:3013:3000 \
  --env-file .env \
  resturant-saas:latest
```

## Access the Application

The application will be available at:
- Local: `http://localhost:3013`
- From VPS: `http://127.0.0.1:3013`

## Useful Commands

```bash
# View logs
docker logs -f resturant-saas

# Stop the container
docker-compose down

# Restart the container
docker-compose restart

# Update and rebuild
git pull
docker-compose up -d --build
```

## Health Check

The container includes a health check. You can verify it's running:
```bash
docker ps
# Should show "healthy" status
```

## Troubleshooting

1. **Build fails**: Check that all environment variables are set
2. **Database connection issues**: Verify `DATABASE_URL` is correct
3. **Port already in use**: Change port in `docker-compose.yml` (line 12)
4. **Prisma errors**: Run migrations inside the container:
   ```bash
   docker exec -it resturant-saas npx prisma migrate deploy
   ```
