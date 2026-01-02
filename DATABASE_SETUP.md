# Database Setup Guide

This project uses **TypeORM** with **PostgreSQL** for database management.

## Prerequisites

1. Install PostgreSQL on your system:
   - macOS: `brew install postgresql@14`
   - Ubuntu: `sudo apt-get install postgresql postgresql-contrib`
   - Windows: Download from [PostgreSQL official website](https://www.postgresql.org/download/)

2. Start PostgreSQL service:
   - macOS: `brew services start postgresql@14`
   - Linux: `sudo service postgresql start`
   - Windows: Start from Services

## Configuration

1. Create a `.env` file in the root directory (copy from `.env.example` if available):

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=timesheet_db
DB_SYNCHRONIZE=true
DB_LOGGING=false

# Application Configuration
PORT=3000
NODE_ENV=development
```

2. Create the database:

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE timesheet_db;

# Exit psql
\q
```

## Database Module

The database is configured in `src/database/database.module.ts` using TypeORM with async configuration that reads from environment variables.

## Entities

Entities are located in `src/entities/` directory. A sample `User` entity has been created as an example.

### Creating New Entities

1. Create a new entity file in `src/entities/`:

```typescript
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('table_name')
export class YourEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;
}
```

2. TypeORM will automatically discover entities matching the pattern: `**/*.entity{.ts,.js}`

## Important Notes

- **DB_SYNCHRONIZE=true**: Automatically syncs database schema with entities (use only in development)
- **DB_SYNCHRONIZE=false**: Use migrations in production
- **DB_LOGGING=true**: Enables SQL query logging (useful for debugging)

## Running Migrations (Production)

For production, disable `DB_SYNCHRONIZE` and use migrations:

```bash
# Generate migration
npm run typeorm migration:generate -- -n MigrationName

# Run migrations
npm run typeorm migration:run
```

## Testing Database Connection

Start the application:

```bash
npm run start:dev
```

If the database connection is successful, you'll see the application start without errors. If there are connection issues, check:

1. PostgreSQL is running
2. Database credentials in `.env` are correct
3. Database `timesheet_db` exists

