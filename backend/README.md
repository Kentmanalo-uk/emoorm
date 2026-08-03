# E-MOORM Backend API

Express.js REST API for the E-MOORM e-commerce platform serving Oriental Mindoro, Philippines.

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MySQL (via Laragon)
- **ORM**: Prisma
- **Authentication**: JWT + bcrypt
- **Validation**: express-validator

## Project Structure

```
backend/
├── src/
│   ├── config/          # Configuration files
│   │   ├── env.js       # Environment variables
│   │   └── database.js  # Prisma client
│   ├── controllers/     # Request handlers
│   ├── middleware/      # Custom middleware
│   │   ├── auth.js      # Authentication & authorization
│   │   ├── errorHandler.js  # Error handling
│   │   └── validate.js  # Validation middleware
│   ├── repositories/    # Database queries
│   ├── routes/          # API routes
│   │   └── index.js     # Routes index
│   ├── services/        # Business logic
│   ├── validators/      # Request validators
│   ├── utils/           # Helper functions
│   │   ├── jwt.js       # JWT utilities
│   │   ├── password.js  # Password hashing
│   │   └── response.js  # Response formatters
│   └── app.js           # Express app
├── prisma/
│   └── schema.prisma    # Database schema
├── uploads/             # File uploads directory
├── .env                 # Environment variables
├── .env.example         # Environment template
├── server.js            # Entry point
└── package.json         # Dependencies
```

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and update the values:

```bash
cp .env.example .env
```

Update the database connection string in `.env`:

```env
DATABASE_URL="mysql://root:@localhost:3306/emoorm_db"
```

### 3. Set Up Database

Make sure MySQL is running in Laragon, then:

```bash
# Generate Prisma client
npx prisma generate

# Create database and run migrations
npx prisma migrate dev --name init

# (Optional) Seed database with initial data
npx prisma db seed
```

### 4. Start Development Server

```bash
npm run dev
```

The API will be available at `http://localhost:3000/api`

## Available Scripts

- `npm start` - Run production server
- `npm run dev` - Run development server with nodemon
- `npx prisma studio` - Open Prisma Studio (database GUI)
- `npx prisma migrate dev` - Create and apply migrations
- `npx prisma generate` - Generate Prisma client
- `npx prisma db push` - Push schema changes without migrations

## API Documentation

### Base URL

```
http://localhost:3000/api
```

### Standard Response Format

**Success Response:**

```json
{
  "success": true,
  "message": "Operation successful",
  "data": {}
}
```

**Error Response:**

```json
{
  "success": false,
  "message": "Error message",
  "errors": []
}
```

### Authentication

Protected endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### Health Check

```
GET /api/health
```

Returns server status and timestamp.

## User Roles

- **BUYER** - Default role for registered users
- **SELLER** - Buyers who own a store
- **MUNICIPAL_ADMIN** - Manages one municipality
- **SUPER_ADMIN** - Full platform access

## Key Features

✓ JWT-based authentication
✓ Role-based authorization
✓ Municipality-scoped data access
✓ Comprehensive error handling
✓ Request validation
✓ Standardized API responses
✓ Soft deletes
✓ Audit logging ready
✓ File upload support

## Security Features

- Password hashing with bcrypt
- JWT token authentication
- Role-based access control
- Municipality-based permissions
- Input validation and sanitization
- CORS configuration
- SQL injection protection (Prisma)

## Environment Variables

See `.env.example` for all available configuration options.

Key variables:
- `DATABASE_URL` - MySQL connection string
- `JWT_SECRET` - Secret key for JWT signing
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)

## Database Schema

The database includes these main models:

- **User** - System users with roles
- **Municipality** - Oriental Mindoro municipalities
- **Store** - Seller stores
- **Product** - Items for sale
- **Category** - Product categories
- **Order** - Purchase orders
- **OrderItem** - Order line items
- **CartItem** - Shopping cart
- **WishlistItem** - User wishlists
- **Review** - Product reviews
- **Report** - User/product reports
- **Notification** - User notifications
- **AuditLog** - System audit trail

## Development Guidelines

1. Follow clean architecture principles
2. Keep controllers thin, use services for business logic
3. Use repositories for database queries
4. Always validate input with express-validator
5. Use standardized response utilities
6. Handle errors with asyncHandler wrapper
7. Enforce authentication and authorization
8. Respect municipality-based permissions

## Next Steps

1. Implement authentication routes (register, login, refresh token)
2. Create user management endpoints
3. Build product CRUD operations
4. Implement order processing
5. Add store management
6. Create admin dashboards
7. Set up file upload handling
8. Add email notifications
9. Implement real-time features

## Support

For questions or issues, refer to the main `APP_CONTEXT.md` documentation.

---

**E-MOORM** - Empowering Oriental Mindoro's local economy through digital commerce.
