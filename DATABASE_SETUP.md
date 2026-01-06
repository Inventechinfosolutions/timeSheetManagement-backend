# Database Setup Guide

This project uses **TypeORM** with **MySQL** for database management.

## Prerequisites

1. Install MySQL on your system:
   - macOS: `brew install mysql`
   - Ubuntu: `sudo apt-get install mysql-server`
   - Windows: Download from [MySQL official website](https://dev.mysql.com/downloads/mysql/)

2. Start MySQL service:
   - macOS: `brew services start mysql`
   - Linux: `sudo service mysql start` or `sudo systemctl start mysql`
   - Windows: Start from Services

## Configuration

1. Run the environment setup script to create environment files:

```bash
node setup-env.js
```

Or manually create `.env.local` file with the following configuration:

```env
# MySQL Database Configuration
DB_TYPE=mysql
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=root@123
DB_DATABASE=timesheet_db
DB_NAME=timesheet_db
DB_ENTITIES=dist/**/*.entity.js
DB_SYNCHRONIZE=true
DB_LOGGING=true
```

2. Create the database:

```bash
# Connect to MySQL
mysql -u root -p

# Create database
CREATE DATABASE timesheet_db;

# Exit MySQL
exit;
```

Or using command line:
```bash
mysql -u root -p -e "CREATE DATABASE timesheet_db;"
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

1. MySQL is running
2. Database credentials in `.env.local` are correct
3. Database `timesheet_db` exists
4. MySQL user has proper permissions

