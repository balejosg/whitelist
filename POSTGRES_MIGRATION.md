# PostgreSQL Migration Guide

## Overview

The OpenPath API has been migrated from JSON file storage to **PostgreSQL** to support:
- **Horizontal scaling** for SaaS deployment
- **ACID compliance** for data integrity
- **Concurrent access** for hundreds of schools

---

## Local Development Setup

### 1. Start PostgreSQL Database

Use Docker Compose to run a local PostgreSQL instance:

```bash
docker-compose up -d db
```

This starts a PostgreSQL 16 container with:
- Database: `openpath`
- User: `openpath`
- Password: `openpath_dev`
- Port: `5432`

### 2. Configure Environment

Copy the example environment file:

```bash
cd api
cp .env.example .env
```

The database configuration is already set for local development. For production, update:
- `DB_HOST`: Your database server host
- `DB_USER` / `DB_PASSWORD`: Production credentials
- `DB_NAME`: Production database name

### 3. Initialize Database

Run the migration script to create tables and import existing JSON data:

```bash
npm run db:migrate
```

This will:
1. Execute `schema.sql` to create all tables
2. Import data from `data/*.json` files (if they exist)
3. Show migration summary

### 4. Start the API

```bash
npm run dev
```

---

## Migration from JSON Files

If you have existing JSON data in `api/data/`, the migration script will automatically import it.

**IMPORTANT**: Backup your `data/` directory before migrating:

```bash
cp -r api/data api/data.backup
```

The migration is **idempotent** - you can run it multiple times safely.

---

## Production Deployment

### Managed PostgreSQL Services

For SaaS deployment, use a managed PostgreSQL service:

- **AWS RDS** (Recommended for AWS deployments)
- **Google Cloud SQL** (GCP)
- **DigitalOcean Managed Databases**
- **Supabase** (Includes auth + storage)
- **Neon** (Serverless Postgres)

### Configuration

Set these environment variables in your production environment:

```bash
DB_HOST=your-db-host.rds.amazonaws.com
DB_PORT=5432
DB_NAME=openpath_prod
DB_USER=openpath_prod_user
DB_PASSWORD=<strong-password>
DB_POOL_MAX=20
```

### SSL Connections (Production)

For production databases with SSL/TLS, update `api/src/db/index.ts` to add SSL configuration:

```typescript
const config = {
    // ... existing config
    ssl: {
        rejectUnauthorized: true
    }
};
```

---

## Testing Database Connection

Test your database connection:

```bash
npm run db:test
```

Expected output:
```
✓ Database connection successful: { now: '2025-12-28T...' }
```

---

## Database Schema

The database includes:
- `users` - User accounts
- `roles` - User roles (admin, teacher, student)
- `requests` - Domain whitelist requests
- `classrooms` - Classroom configurations
- `machines` - Client machines
- `schedules` - Teacher classroom reservations
- `tokens` - Refresh token blacklist
- `settings` - Setup/configuration data

All tables have:
- Automatic `created_at` / `updated_at` timestamps
- Foreign key constraints for referential integrity
- Indexes for performance

---

## Scaling for SaaS

### Horizontal Scaling

The PostgreSQL architecture allows you to run multiple API instances:

```
            ┌──────────────┐
            │ Load Balancer│
            └──────┬───────┘
       ┌───────────┼───────────┐
       │           │           │
  ┌────▼────┐ ┌───▼─────┐ ┌──▼──────┐
  │ API #1  │ │ API #2  │ │ API #3  │
  └────┬────┘ └───┬─────┘ └──┬──────┘
       └───────────┼───────────┘
            ┌──────▼────────┐
            │  PostgreSQL   │
            └───────────────┘
```

### Connection Pooling

The default pool size is 20 connections per API instance. Adjust based on your load:

```bash
DB_POOL_MAX=50  # For high-traffic instances
```

### Performance Tips

1. **Use a managed service** with automated backups
2. **Monitor query performance** with pg_stat_statements
3. **Add indexes** for custom queries
4. **Enable connection pooling** (built-in)
5. **Use read replicas** for reporting/analytics

---

## Troubleshooting

### Can't connect to database

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# View database logs
docker logs openpath-postgres

# Test connection manually
psql -h localhost -U openpath -d openpath
```

### Migration fails

```bash
# Drop and recreate database (⚠️  destroys data)
docker-compose down -v
docker-compose up -d db

# Then re-run migration
npm run db:migrate
```

### Slow queries

Enable query logging in `.env`:

```bash
LOG_LEVEL=debug
```

---

## Reverting to JSON Files (Not Recommended)

The JSON storage modules have been completely replaced. To revert, you would need to:
1. Checkout the previous commit
2. Export data from PostgreSQL
3. Convert to JSON format

**This is NOT supported** - the PostgreSQL migration is a one-way upgrade for SaaS readiness.
