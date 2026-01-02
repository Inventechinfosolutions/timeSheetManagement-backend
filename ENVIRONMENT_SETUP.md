# Environment Configuration Guide

This project uses a simple `PROFILE`-based environment configuration system.

## How It Works

The application reads the `PROFILE` value from the `.env` file and automatically loads the corresponding environment file:

- `PROFILE=local` → loads `.env.local` (falls back to `.env`)
- `PROFILE=prod` → loads `.env.prod` (falls back to `.env`)

## Environment Files

1. **`.env`** - Main configuration file with `PROFILE` setting
2. **`.env.local`** - Local development environment (loaded when `PROFILE=local`)
3. **`.env.prod`** - Production environment (loaded when `PROFILE=prod`)

## Setup Instructions

### 1. Configure Profile

Edit the `.env` file and set the `PROFILE` variable:

**For Local Development:**
```env
PROFILE=local
```

**For Production:**
```env
PROFILE=prod
```

### 2. Running the Application

Simply run the application normally - it will automatically use the correct profile:

```bash
# For local development (PROFILE=local in .env)
npm run start:dev

# For production (PROFILE=prod in .env)
npm run start:prod
```

The application will:
1. Read `PROFILE` from `.env`
2. Load `.env.${PROFILE}` (e.g., `.env.local` or `.env.prod`)
3. Fall back to `.env` if the profile-specific file doesn't exist

## Environment Variables

### Profile Configuration
- `PROFILE` - Set to `local` or `prod` (required in `.env`)

### Database Configuration
- `DB_HOST` - Database host address
- `DB_PORT` - Database port (default: 5432)
- `DB_USERNAME` - Database username
- `DB_PASSWORD` - Database password
- `DB_NAME` - Database name
- `DB_SYNCHRONIZE` - Auto-sync schema (true/false) - **Use false in production**
- `DB_LOGGING` - Enable SQL query logging (true/false)

### Application Configuration
- `PORT` - Application port (default: 3000)
- `NODE_ENV` - Environment mode (development/production)

### Security
- `JWT_SECRET` - Secret key for JWT tokens (use strong key in production)
- `JWT_EXPIRES_IN` - JWT token expiration time (e.g., "7d", "1d")
- `CORS_ORIGIN` - Allowed CORS origins (comma-separated)

## Switching Between Environments

To switch between local and production:

1. **Open `.env` file**
2. **Change the `PROFILE` value:**
   ```env
   PROFILE=local    # For local development
   PROFILE=prod     # For production
   ```
3. **Restart the application**

That's it! No need to set environment variables or use different commands.

## Production Deployment Checklist

Before deploying to production:

1. ✅ Set `PROFILE=prod` in `.env`
2. ✅ Update `.env.prod` with production database credentials
3. ✅ Set a strong `JWT_SECRET` (minimum 32 characters) in `.env.prod`
4. ✅ Update `CORS_ORIGIN` with your production domain in `.env.prod`
5. ✅ Set `DB_SYNCHRONIZE=false` in `.env.prod` (use migrations instead)
6. ✅ Set `DB_LOGGING=false` in `.env.prod` for better performance
7. ✅ Set `NODE_ENV=production` in `.env.prod`

## Security Notes

⚠️ **Never commit `.env`, `.env.local`, or `.env.prod` files to version control!**

These files are already included in `.gitignore`.

## Example: Setting Up for First Time

1. **Edit `.env` file:**
   ```env
   PROFILE=local
   ```

2. **Ensure `.env.local` exists with your local database credentials**

3. **Run the application:**
   ```bash
   npm run start:dev
   ```

The application will automatically load `.env.local` because `PROFILE=local`.

## Troubleshooting

### Environment file not loading?
- Check that `PROFILE` is set correctly in `.env` (should be `local` or `prod`)
- Verify the corresponding file exists (`.env.local` or `.env.prod`)
- Check file permissions

### Database connection issues?
- Verify database credentials in the appropriate `.env` file (`.env.local` or `.env.prod`)
- Ensure PostgreSQL is running
- Check that the database exists

### Profile not working?
- Make sure `PROFILE` is set in `.env` (not in `.env.local` or `.env.prod`)
- Restart the application after changing `PROFILE`
