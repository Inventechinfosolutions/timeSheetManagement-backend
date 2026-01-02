# Authentication API Documentation

This document describes the authentication endpoints and how to use JWT authentication in the TimeSheet Management Backend.

## Endpoints

### 1. Register User

**POST** `/auth/register`

Register a new user account.

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

**Validation Rules:**
- `name`: Required, minimum 2 characters
- `email`: Required, must be a valid email address
- `password`: Required, minimum 6 characters

**Success Response (201):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid-here",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

**Error Response (409):**
```json
{
  "statusCode": 409,
  "message": "User with this email already exists"
}
```

---

### 2. Login

**POST** `/auth/login`

Authenticate user and receive JWT token.

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Success Response (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid-here",
    "name": "John Doe",
    "email": "john@example.com"
  }
}
```

**Error Response (401):**
```json
{
  "statusCode": 401,
  "message": "Invalid credentials"
}
```

---

### 3. Get User Profile (Protected)

**GET** `/auth/profile`

Get the authenticated user's profile information.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Success Response (200):**
```json
{
  "id": "uuid-here",
  "name": "John Doe",
  "email": "john@example.com",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

**Error Response (401):**
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

---

## Using JWT Authentication

### Step 1: Register or Login

First, register a new user or login to get an access token:

```bash
# Register
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "password123"
  }'

# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'
```

### Step 2: Use the Token

Include the token in the Authorization header for protected routes:

```bash
curl -X GET http://localhost:3000/auth/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Protecting Your Routes

To protect any route in your application, use the `JwtAuthGuard`:

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';

@Controller('protected')
export class ProtectedController {
  @UseGuards(JwtAuthGuard)
  @Get()
  getProtectedData() {
    return { message: 'This is protected data' };
  }
}
```

The authenticated user will be available in the request object:

```typescript
@UseGuards(JwtAuthGuard)
@Get('me')
getMe(@Request() req) {
  return req.user; // Contains user information
}
```

---

## Environment Variables

Make sure to set these in your `.env.local` or `.env.prod` file:

```env
JWT_SECRET=your-secret-key-min-32-characters
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:3000,http://localhost:3001
```

**Important:**
- Use a strong, random JWT_SECRET in production (minimum 32 characters)
- Never commit JWT_SECRET to version control
- Adjust JWT_EXPIRES_IN based on your security requirements

---

## Database Schema

The `users` table is automatically created with the following structure:

- `id` (UUID, Primary Key)
- `name` (VARCHAR 255)
- `email` (VARCHAR 255, Unique)
- `password` (VARCHAR 255, Hashed with bcrypt)
- `createdAt` (Timestamp)
- `updatedAt` (Timestamp)

---

## Security Features

1. **Password Hashing**: Passwords are hashed using bcrypt with salt rounds of 10
2. **JWT Tokens**: Secure token-based authentication
3. **Input Validation**: All inputs are validated using class-validator
4. **CORS Protection**: Configurable CORS origins
5. **Password Exclusion**: Passwords are excluded from user queries by default

---

## Testing with Postman/Insomnia

1. **Register Endpoint:**
   - Method: POST
   - URL: `http://localhost:3000/auth/register`
   - Body (JSON):
     ```json
     {
       "name": "Test User",
       "email": "test@example.com",
       "password": "test123"
     }
     ```

2. **Login Endpoint:**
   - Method: POST
   - URL: `http://localhost:3000/auth/login`
   - Body (JSON):
     ```json
     {
       "email": "test@example.com",
       "password": "test123"
     }
     ```

3. **Profile Endpoint:**
   - Method: GET
   - URL: `http://localhost:3000/auth/profile`
   - Headers:
     - `Authorization: Bearer <your-token-here>`

---

## Error Handling

All endpoints return appropriate HTTP status codes:

- `200` - Success
- `201` - Created (Registration)
- `400` - Bad Request (Validation errors)
- `401` - Unauthorized (Invalid credentials or missing token)
- `409` - Conflict (Email already exists)
- `500` - Internal Server Error

